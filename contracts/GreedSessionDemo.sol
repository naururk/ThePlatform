// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * GreedSessionDemo (Zama FHEVM, Sepolia)
 *
 * - До 50 игроков (этажи 1..50)
 * - Депозиты шифруются (euint64); агрегаты pool/treasury/nextPool — шифр
 * - Выбор (GRAB/SKIM/HOLD) для PoC хранится открыто
 * - Раскладка этажей задаётся фронтом (синхронизировано с визуалом)
 *
 * Чтение агрегатов в этой версии — через user-decrypt (ACL + bytes32 handle):
 *   1) owner вызывает grantAggregatesTo(user)      — выдаём право на дешифровку
 *   2) фронт берёт хэндлы из getAggregateHandles() — FHE.toBytes32(euint64)
 *   3) фронт делает sdk.userDecrypt(handle)
 *
 * Если позже обновишь либу, можно включить public-decrypt:
 *   - makeAggregatesPublic()   (не-view, помечает как публичные)
 *   - и отдельный геттер под новый API (если будет нужен).
 */

import {
    FHE,
    euint64,
    ebool,
    externalEuint64
} from "@fhevm/solidity/lib/FHE.sol";

import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract GreedSessionDemo is SepoliaConfig {
    /* ─────────── Types & const ─────────── */

    enum Phase  { Waiting, Running, Finished }
    enum Choice { NONE, GRAB, SKIM, HOLD }

    uint8 public constant MAX_PLAYERS = 50;

    struct Player {
        address  addr;     // 0 => бот
        uint8    floor;    // 1..50
        Choice   choice;   // выбор (PoC — открыто)
        euint64  deposit;  // шифрованный депозит (scale на фронте)
        bool     exists;
    }

    /* ─────────── Ownable ─────────── */

    address public owner;
    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor() {
        owner = msg.sender;
        phase = Phase.Waiting;

        // Инициализируем агрегаты нулём-шифром и разрешаем переиспользование
        pool     = FHE.asEuint64(0);
        treasury = FHE.asEuint64(0);
        nextPool = FHE.asEuint64(0);
        FHE.allowThis(pool);
        FHE.allowThis(treasury);
        FHE.allowThis(nextPool);
    }

    function transferOwnership(address n) external onlyOwner {
        require(n != address(0), "Zero owner");
        owner = n;
    }

    /* ─────────── Storage ─────────── */

    Phase  public phase;

    // агрегаты экономики (зашифрованы)
    euint64 private pool;       // общий банк
    euint64 private treasury;   // 1% комиссий
    euint64 private nextPool;   // 1% комиссий в следующий банк

    // слоты игроков по этажам
    mapping(uint8 => Player) public byFloor;   // floor => Player
    mapping(address => uint8) public floorOf;  // addr => floor (0 если нет)

    uint8 public registered; // 0..50

    /* ─────────── Events ─────────── */

    event Registered(address indexed user, uint8 indexed floor, bytes32 depositHandle);
    event ChoiceSet(address indexed user, uint8 indexed floor, Choice choice);
    event SessionStarted(uint256 timestamp);
    event SessionFinished(uint256 timestamp);
    event Aggregates(bytes32 poolH, bytes32 treasuryH, bytes32 nextPoolH);

    /* ─────────── Modifiers ─────────── */

    modifier inPhase(Phase p) { require(phase == p, "Bad phase"); _; }

    function version() external pure returns (string memory) {
        return "GreedSessionDemo/1.0.1-sepolia";
    }

    /* ─────────── Registration ─────────── */

    function register(
        uint8 floor,
        externalEuint64 depositExt,
        bytes calldata proof,
        string calldata /*name*/
    )
        external
        inPhase(Phase.Waiting)
    {
        require(floor >= 1 && floor <= MAX_PLAYERS, "floor");
        require(!byFloor[floor].exists, "taken");
        require(floorOf[msg.sender] == 0, "already");

        euint64 dep = FHE.fromExternal(depositExt, proof);

        pool = FHE.add(pool, dep);
        FHE.allowThis(pool);

        byFloor[floor] = Player({
            addr: msg.sender,
            floor: floor,
            choice: Choice.NONE,
            deposit: dep,
            exists: true
        });
        floorOf[msg.sender] = floor;

        registered += 1;
        require(registered <= MAX_PLAYERS, "overflow");

        emit Registered(msg.sender, floor, FHE.toBytes32(dep));
        emit Aggregates(FHE.toBytes32(pool), FHE.toBytes32(treasury), FHE.toBytes32(nextPool));
    }

    function fillBot(
        uint8 floor,
        externalEuint64 depositExt,
        bytes calldata proof
    )
        external
        onlyOwner
        inPhase(Phase.Waiting)
    {
        require(floor >= 1 && floor <= MAX_PLAYERS, "floor");
        require(!byFloor[floor].exists, "taken");

        euint64 dep = FHE.fromExternal(depositExt, proof);

        pool = FHE.add(pool, dep);
        FHE.allowThis(pool);

        byFloor[floor] = Player({
            addr: address(0),
            floor: floor,
            choice: Choice.NONE,
            deposit: dep,
            exists: true
        });

        registered += 1;
        require(registered <= MAX_PLAYERS, "overflow");

        emit Registered(address(0), floor, FHE.toBytes32(dep));
        emit Aggregates(FHE.toBytes32(pool), FHE.toBytes32(treasury), FHE.toBytes32(nextPool));
    }

    /* ─────────── Choices ─────────── */

    function setChoice(Choice c) external inPhase(Phase.Waiting) {
        uint8 f = floorOf[msg.sender];
        require(f != 0, "not registered");
        Player storage p = byFloor[f];
        require(p.choice == Choice.NONE, "picked");
        p.choice = c;
        emit ChoiceSet(msg.sender, f, c);
    }

    function setChoiceForBot(uint8 floor, Choice c)
        external
        onlyOwner
        inPhase(Phase.Waiting)
    {
        Player storage p = byFloor[floor];
        require(p.exists && p.addr == address(0), "not bot");
        require(p.choice == Choice.NONE, "picked");
        p.choice = c;
        emit ChoiceSet(address(0), floor, c);
    }

    /* ─────────── Session flow ─────────── */

    function start() external onlyOwner inPhase(Phase.Waiting) {
        require(registered == MAX_PLAYERS, "need 50");
        phase = Phase.Running;
        emit SessionStarted(block.timestamp);
    }

    function finish() external onlyOwner inPhase(Phase.Running) {
        phase = Phase.Finished;
        emit SessionFinished(block.timestamp);
    }

    /* ─────────── Reading aggregates (user-decrypt) ─────────── */

    /// Выдать адресу право на дешифровку агрегатов (user-decrypt).
    function grantAggregatesTo(address who) external onlyOwner {
        require(who != address(0), "zero");
        FHE.allow(pool, who);
        FHE.allow(treasury, who);
        FHE.allow(nextPool, who);
    }

    /// Вернуть bytes32-хэндлы шифров агрегатов (используй sdk.userDecrypt(handle)).
    function getAggregateHandles()
        external
        view
        returns (bytes32 poolH, bytes32 treasuryH, bytes32 nextPoolH)
    {
        poolH     = FHE.toBytes32(pool);
        treasuryH = FHE.toBytes32(treasury);
        nextPoolH = FHE.toBytes32(nextPool);
    }

    /* ─────────── (опционально) Public-decrypt hook ───────────
       Оставляем на будущее — если обновишь либу и захочешь публичное чтение. */

    function makeAggregatesPublic() external onlyOwner {
        FHE.makePubliclyDecryptable(pool);
        FHE.makePubliclyDecryptable(treasury);
        FHE.makePubliclyDecryptable(nextPool);
        // После этого в новой версии либы можно добавить геттер, если появится нужный API.
    }

    /* ─────────── Dev helpers ─────────── */

    function devResetAggregates() external onlyOwner inPhase(Phase.Waiting) {
        pool     = FHE.asEuint64(0);
        treasury = FHE.asEuint64(0);
        nextPool = FHE.asEuint64(0);
        FHE.allowThis(pool);
        FHE.allowThis(treasury);
        FHE.allowThis(nextPool);
        emit Aggregates(FHE.toBytes32(pool), FHE.toBytes32(treasury), FHE.toBytes32(nextPool));
    }

    /* ─────────── Private ─────────── */

    // здесь можно будет добавить on-chain applyPayout(euint64 payout) и т.д.
}
