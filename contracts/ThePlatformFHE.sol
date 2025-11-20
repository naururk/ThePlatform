// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
  FHE,
  ebool,
  euint8,
  euint16,
  euint32,
  euint64,
  externalEuint8,
  externalEuint64
} from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ThePlatformFHE is ZamaEthereumConfig {
  uint32 public constant FLOORS = 50;
  enum Status { WAITING, RUNNING, DONE }
  enum ChoiceCode { NONE, GRAB, SKIM, HOLD } // 0..3

  address public owner;
  modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

  address public publisher;
  modifier onlyPublisher() { require(msg.sender == publisher, "Not publisher"); _; }

  function transferOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), "zero owner");
    owner = newOwner;
  }
  function setPublisher(address p) external onlyOwner {
    require(p != address(0), "zero publisher");
    publisher = p;
  }

  uint256 private _locked = 1;
  modifier nonReentrant() {
    require(_locked == 1, "reentrancy");
    _locked = 2;
    _;
    _locked = 1;
  }

  struct PlayerEnc {
    address addr;
    uint32  floor;
    bool    joined;
    bool    claimed;

    euint64 eDeposit;
    euint8  eChoice;
    euint64 ePayout; // gross (до комиссий)
  }

  struct Session {
    Status  status;
    uint64  id;
    uint32  playersCount;
    uint16  winGrab2;
    uint16  winSkim2;
    uint64  startTs;
    uint64  endTs;

    euint64 ePool;
    euint64 eTreasury;
    euint64 eNextPool;

    euint64 eHoldTotal;
    euint64 eHoldRemainder;
  }
  Session private S;

  address[] private participants;
  mapping(address => bool)   public joinedInCurrent;
  mapping(address => uint32) public floorOf;
  mapping(address => string) public nickOf;

  // Индексация по реальному номеру этажа (1..FLOORS), разрежённая
  mapping(uint32 => PlayerEnc) public byFloor;

  // Реально занятые этажи текущего сезона (для итераций)
  uint32[] private occupiedFloors;

  // ===== Публичные снэпшоты =====
  mapping(uint64 => mapping(address => uint8))    public choicePublic;
  mapping(uint64 => mapping(address => uint256))  public depositPublic;
  mapping(uint64 => mapping(address => uint256))  public payoutPublic;
  mapping(address => uint256) public unclaimedTotal;
  uint256 public treasuryPublic;     // накапливаем по сезонам, клеймим админом
  uint256 public nextPoolPublic;     // перенос в следующий сезон (per-season)
  uint256 public carriedInPublic;    // сумма, перенесённая в новый сезон (заполняется при старте нового сезона)
  uint256 public remainderToCarryPublic; // ⬅️ NEW: остаток пула, который нужно перенести (если нет HOLD)

  uint16 public holdStreakBoost;

  struct Pending { euint64 eDeposit; euint8 eChoice; }
  mapping(address => Pending) private pending;

  event SeasonCreated(uint64 indexed sessionId);
  event Joined(address indexed player, uint64 indexed sessionId, bytes32 depositH, bytes32 choiceH, string nick);
  event FloorAssigned(uint64 indexed sessionId, address indexed player, uint32 floor);
  event FloorResolved(uint64 indexed sessionId, uint32 floor, bool success);
  event ResultsReady(uint64 indexed sessionId);

  event PayoutsPublished(uint64 indexed sessionId);
  event ResultsPublished(uint64 indexed sessionId);
  event PlayerClaimed(address indexed player, uint256 amount);
  event TreasuryClaimed(address indexed to, uint256 amount);
  event CarryOver(uint64 indexed newSid, uint256 amount); // перенесено в новый сезон

  constructor() {
    owner = msg.sender;
    publisher = msg.sender;
    _newSeason();
  }

  function _newSeason() internal {
    S = Session({
      status: Status.WAITING,
      id: S.id + 1,
      playersCount: 0,
      winGrab2: uint16((17 + holdStreakBoost) * 2),
      winSkim2: uint16((40 + holdStreakBoost) * 2),
      startTs: 0,
      endTs: 0,
      ePool: FHE.asEuint64(0),
      eTreasury: FHE.asEuint64(0),
      eNextPool: FHE.asEuint64(0),
      eHoldTotal: FHE.asEuint64(0),
      eHoldRemainder: FHE.asEuint64(0)
    });

    FHE.allowThis(S.ePool);
    FHE.allowThis(S.eTreasury);
    FHE.allowThis(S.eNextPool);
    FHE.allowThis(S.eHoldTotal);
    FHE.allowThis(S.eHoldRemainder);

    delete participants;
    delete occupiedFloors;
    emit SeasonCreated(S.id);
  }

  function join(
    string calldata nick,
    externalEuint64 encDepositWei,
    externalEuint8  encChoice,
    bytes calldata  proof
  ) external payable {
    require(S.status == Status.WAITING, "not WAITING");
    require(msg.value > 0, "no value");
    require(!joinedInCurrent[msg.sender], "already joined");
    require(S.playersCount < FLOORS, "full");

    euint64 depCt = FHE.fromExternal(encDepositWei, proof);
    euint8  choCt = FHE.fromExternal(encChoice,     proof);

    FHE.allow(depCt, msg.sender);
    FHE.allow(choCt, msg.sender);
    FHE.allowThis(depCt);
    FHE.allowThis(choCt);

    S.ePool = FHE.add(S.ePool, depCt);
    FHE.allowThis(S.ePool);

    participants.push(msg.sender);
    joinedInCurrent[msg.sender] = true;
    S.playersCount += 1;

    pending[msg.sender] = Pending({ eDeposit: depCt, eChoice: choCt });

    if (bytes(nick).length > 0) nickOf[msg.sender] = nick;

    emit Joined(msg.sender, S.id, FHE.toBytes32(depCt), FHE.toBytes32(choCt), nick);
  }

  // ── NEW: старт сезона → RUNNING (без ончейн-расчёта)
  function startSession() external onlyOwner {
    require(S.status == Status.WAITING, "bad status");
    require(S.playersCount >= 3, "need >=3");

    S.status  = Status.RUNNING;
    S.startTs = uint64(block.timestamp);

    _assignFloorsAndMaterializePlayers();

    // Открываем депозиты/выборы для офчейн-расчёта
    for (uint32 i = 0; i < occupiedFloors.length; i++) {
      uint32 f = occupiedFloors[i];
      PlayerEnc storage P = byFloor[f];
      if (P.joined) {
        FHE.makePubliclyDecryptable(P.eDeposit);
        FHE.makePubliclyDecryptable(P.eChoice);
      }
    }
  }

  function runSession() external onlyOwner {
    require(S.status == Status.WAITING, "bad status");
    require(S.playersCount >= 3, "need >=3");

    S.status = Status.RUNNING;
    S.startTs = uint64(block.timestamp);

    _assignFloorsAndMaterializePlayers();
    _processOccupiedFloors();
    _finalizeHOLD_preparePublish();

    for (uint32 i = 0; i < occupiedFloors.length; i++) {
      uint32 f = occupiedFloors[i];
      FHE.makePubliclyDecryptable(byFloor[f].ePayout);
    }

    S.status = Status.DONE;
    S.endTs = uint64(block.timestamp);
    emit ResultsReady(S.id);
  }

  function _assignFloorsAndMaterializePlayers() internal {
    uint32 n = S.playersCount;
    bytes32 seed = keccak256(abi.encode(S.id, block.prevrandao, address(this), n));

    uint32[] memory all = new uint32[](FLOORS);
    for (uint32 i = 0; i < FLOORS; i++) all[i] = i + 1;
    for (uint32 i = FLOORS; i > 1; i--) {
      uint32 j = uint32(uint256(keccak256(abi.encode(seed, i))) % i);
      (all[i-1], all[j]) = (all[j], all[i-1]);
    }

    delete occupiedFloors;

    for (uint32 k = 0; k < n; k++) {
      address p = participants[k];
      uint32 floor = all[k];
      occupiedFloors.push(floor);

      Pending storage pend = pending[p];
      PlayerEnc storage PE = byFloor[floor];

      PE.addr    = p;
      PE.floor   = floor;
      PE.joined  = true;
      PE.claimed = false;

      PE.eDeposit = pend.eDeposit;
      PE.eChoice  = pend.eChoice;
      PE.ePayout  = FHE.asEuint64(0);

      FHE.allowThis(PE.eDeposit);
      FHE.allowThis(PE.eChoice);
      FHE.allowThis(PE.ePayout);

      floorOf[p] = floor;
      emit FloorAssigned(S.id, p, floor);
      delete pending[p];
    }
  }

  function _processOccupiedFloors() internal {
    for (uint32 i = 0; i < occupiedFloors.length; i++) {
      uint32 f = occupiedFloors[i];
      PlayerEnc storage P = byFloor[f];

      uint256 r = uint256(keccak256(abi.encode(S.id, f, block.prevrandao, address(this))));
      uint16 randIndex = uint16(r % FLOORS);
      bool success = (uint16(randIndex) * 2) < S.winGrab2 || (uint16(randIndex) * 2) < S.winSkim2;
      emit FloorResolved(S.id, f, success);
      if (success) {
        if (S.winGrab2 > 0) S.winGrab2 -= 1;
        if (S.winSkim2 > 0) S.winSkim2 -= 1;
      }

      ebool isGrab = FHE.eq(P.eChoice, FHE.asEuint8(uint8(ChoiceCode.GRAB)));
      ebool isSkim = FHE.eq(P.eChoice, FHE.asEuint8(uint8(ChoiceCode.SKIM)));

      euint64 depTimes3 = FHE.mul(P.eDeposit, FHE.asEuint64(3));
      euint64 grossGrab = FHE.select(isGrab, depTimes3, FHE.asEuint64(0));

      euint64 depDiv4   = FHE.shr(P.eDeposit, 2); // /4
      euint64 grossSkim = FHE.select(isSkim, FHE.add(P.eDeposit, depDiv4), FHE.asEuint64(0)); // 1.25x

      euint64 gross = FHE.add(grossGrab, grossSkim);

      ebool grossLEPool   = FHE.le(gross, S.ePool);
      euint64 payoutDelta = FHE.select(grossLEPool, gross, S.ePool);

      P.ePayout = FHE.add(P.ePayout, payoutDelta);
      FHE.allowThis(P.ePayout);

      S.ePool = FHE.sub(S.ePool, payoutDelta);
      FHE.allowThis(S.ePool);
    }
  }

  function _finalizeHOLD_preparePublish() internal {
    euint64 eHoldTotal = FHE.asEuint64(0);
    FHE.allowThis(eHoldTotal);

    for (uint32 i = 0; i < occupiedFloors.length; i++) {
      uint32 f = occupiedFloors[i];
      PlayerEnc storage P = byFloor[f];
      ebool isHold = FHE.eq(P.eChoice, FHE.asEuint8(uint8(ChoiceCode.HOLD)));
      euint64 addOrZero = FHE.select(isHold, P.eDeposit, FHE.asEuint64(0));
      eHoldTotal = FHE.add(eHoldTotal, addOrZero);

      FHE.makePubliclyDecryptable(P.eDeposit);
      FHE.makePubliclyDecryptable(P.eChoice);
    }

    S.eHoldTotal     = eHoldTotal;
    S.eHoldRemainder = S.ePool;

    FHE.allowThis(S.eHoldTotal);
    FHE.allowThis(S.eHoldRemainder);

    FHE.makePubliclyDecryptable(S.eHoldTotal);
    FHE.makePubliclyDecryptable(S.eHoldRemainder);

    S.ePool = FHE.asEuint64(0);
    FHE.allowThis(S.ePool);
  }

  function publishPayouts(
    address[] calldata addrs,
    uint256[] calldata payoutsWei,
    uint256 treasuryWei,
    uint256 nextPoolWei
  ) external onlyPublisher {
    require(S.status == Status.DONE, "not DONE");
    require(addrs.length == payoutsWei.length, "len mismatch");
    uint64 sid = S.id;

    uint256 totalPlayers = 0;
    for (uint256 i = 0; i < addrs.length; i++) {
      address a = addrs[i];
      uint256 amount = payoutsWei[i];
      require(payoutPublic[sid][a] == 0, "already published");
      payoutPublic[sid][a] = amount;
      unclaimedTotal[a] += amount;
      totalPlayers += amount;
    }
    treasuryPublic += treasuryWei; // копим суммарно
    nextPoolPublic = nextPoolWei;

    emit PayoutsPublished(sid);
  }

  function publishResults(
    address[] calldata addrs,
    uint8[]    calldata choiceCodes,
    uint256[]  calldata depositWei,
    uint256[]  calldata payoutsWei,
    uint256 treasuryWei,
    uint256 nextPoolWei,
    uint256 holdRemainderWei   // ⬅️ NEW: остаток пула, если нет HOLD
  ) external onlyPublisher {
    require(S.status == Status.RUNNING || S.status == Status.DONE, "bad status");

    uint64 sid = S.id;

    require(
      addrs.length == choiceCodes.length &&
      addrs.length == depositWei.length &&
      addrs.length == payoutsWei.length,
      "len mismatch"
    );

    for (uint256 i = 0; i < addrs.length; i++) {
      address a = addrs[i];
      require(depositPublic[sid][a] == 0, "already published");

      choicePublic[sid][a]  = choiceCodes[i];
      depositPublic[sid][a] = depositWei[i];

      uint256 out = payoutsWei[i];
      payoutPublic[sid][a] = out;
      if (out > 0) unclaimedTotal[a] += out;
    }

    // ⬇️ Treasury — накапливаем, Next pool — состояние текущего сезона
    treasuryPublic += treasuryWei;
    nextPoolPublic  = nextPoolWei;

    // сохраняем остаток для переноса (0, если HOLD был и остатка нет)
    remainderToCarryPublic = holdRemainderWei;

    // Переводим сезон в DONE
    S.status = Status.DONE;
    S.endTs  = uint64(block.timestamp);

    emit ResultsPublished(sid);
  }

  // ===== Claims =====
  function claim(uint64 sessionId, uint256 amount) external nonReentrant {
    require(amount > 0, "zero");
    uint256 available = payoutPublic[sessionId][msg.sender];
    require(available >= amount, "insufficient");
    payoutPublic[sessionId][msg.sender] = available - amount;
    (bool ok, ) = payable(msg.sender).call{ value: amount }("");
    require(ok, "transfer failed");
    emit PlayerClaimed(msg.sender, amount);
  }

  function claimUnclaimed() external nonReentrant {
    uint256 amount = unclaimedTotal[msg.sender];
    require(amount > 0, "nothing");
    unclaimedTotal[msg.sender] = 0;
    (bool ok, ) = payable(msg.sender).call{ value: amount }("");
    require(ok, "transfer failed");
    emit PlayerClaimed(msg.sender, amount);
  }

  function claimTreasury(uint256 amount) external onlyOwner nonReentrant {
    require(amount > 0 && amount <= treasuryPublic, "bad amount");
    treasuryPublic -= amount;
    (bool ok, ) = payable(msg.sender).call{ value: amount }("");
    require(ok, "treasury transfer failed");
    emit TreasuryClaimed(msg.sender, amount);
  }

  // ===== Views =====
  function currentSession()
    external view returns (
      uint64 id, Status status, uint32 playersCount,
      uint16 winGrabHalfSteps, uint16 winSkimHalfSteps,
      uint64 startTs, uint64 endTs
    )
  {
    return (S.id, S.status, S.playersCount, S.winGrab2, S.winSkim2, S.startTs, S.endTs);
  }

  function playerFloor(address player) external view returns (uint32 floor) { return floorOf[player]; }

  function getPlayerPublic(address a) external view returns (bool joined, uint32 floor, string memory nick) {
    return (joinedInCurrent[a], floorOf[a], nickOf[a]);
  }

  function getMyPendingHandles() external view returns (bytes32 depositH, bytes32 choiceH) {
    Pending storage p = pending[msg.sender];
    return (FHE.toBytes32(p.eDeposit), FHE.toBytes32(p.eChoice));
  }

  function getPlayerHandles(uint32 floor) external view
    returns (bytes32 depositH, bytes32 choiceH, bytes32 payoutGrossH)
  {
    PlayerEnc storage P = byFloor[floor];
    return (FHE.toBytes32(P.eDeposit), FHE.toBytes32(P.eChoice), FHE.toBytes32(P.ePayout));
  }

  function getSeasonHandles() external view returns (bytes32 holdTotalH, bytes32 holdRemainderH) {
    return (FHE.toBytes32(S.eHoldTotal), FHE.toBytes32(S.eHoldRemainder));
  }

  function getOccupiedFloors() external view returns (uint32[] memory) {
    return occupiedFloors;
  }

  function choicePublicCurrent(uint32 floor) external view returns (uint8) {
    address a = byFloor[floor].addr;
    if (a == address(0)) return 0;
    return choicePublic[S.id][a];
  }
  function depositPublicCurrent(uint32 floor) external view returns (uint256) {
    address a = byFloor[floor].addr;
    if (a == address(0)) return 0;
    return depositPublic[S.id][a];
  }
  function payoutPublicCurrent(uint32 floor) external view returns (uint256) {
    address a = byFloor[floor].addr;
    if (a == address(0)) return 0;
    return payoutPublic[S.id][a];
  }

  function startNextSeason(uint16 newHoldStreakBoost) external onlyOwner {
    require(S.status == Status.DONE, "finish first");

    for (uint32 i = 0; i < occupiedFloors.length; i++) {
      uint32 f = occupiedFloors[i];
      address a = byFloor[f].addr;
      if (a != address(0)) {
        joinedInCurrent[a] = false;
        floorOf[a] = 0;
      }
      delete byFloor[f];
    }
    delete participants;
    delete occupiedFloors;

    // переносим: nextPool + остаток пула без HOLD (если был)
    uint256 carry = nextPoolPublic + remainderToCarryPublic;
    holdStreakBoost = newHoldStreakBoost;
    _newSeason();

    // записываем carriedIn для нового сезона и эмитим событие
    carriedInPublic = carry;
    emit CarryOver(S.id, carry);

    if (carry > 0) {
      S.ePool = FHE.asEuint64(uint64(carry));
      FHE.allowThis(S.ePool);
    }

    // обнуляем состояние прошлого сезона
    nextPoolPublic = 0;
    remainderToCarryPublic = 0;
  }

  receive() external payable {}
  fallback() external payable {}
}
