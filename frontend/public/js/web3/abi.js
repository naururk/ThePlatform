// public/js/web3/abi.js
export const THE_PLATFORM_ABI = [
  // Views
  { inputs: [], name: "owner",     outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "publisher", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },

  {
    inputs: [],
    name: "currentSession",
    outputs: [
      { name: "id",               type: "uint64" },
      { name: "status",           type: "uint8"  },
      { name: "playersCount",     type: "uint32" },
      { name: "winGrabHalfSteps", type: "uint16" },
      { name: "winSkimHalfSteps", type: "uint16" },
      { name: "startTs",          type: "uint64" },
      { name: "endTs",            type: "uint64" },
    ],
    stateMutability: "view",
    type: "function",
  },

  { inputs: [{ name: "player", type: "address" }], name: "playerFloor",     outputs: [{ name: "floor", type: "uint32" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "arg0",   type: "address" }], name: "joinedInCurrent", outputs: [{ type: "bool" }],                 stateMutability: "view", type: "function" },
  { inputs: [{ name: "arg0",   type: "address" }], name: "nickOf",          outputs: [{ type: "string" }],               stateMutability: "view", type: "function" },

  {
    inputs: [{ name: "a", type: "address" }],
    name: "getPlayerPublic",
    outputs: [
      { name: "joined", type: "bool"   },
      { name: "floor",  type: "uint32" },
      { name: "nick",   type: "string" },
    ],
    stateMutability: "view",
    type: "function",
  },

  { inputs: [],                                  name: "getMyPendingHandles", outputs: [{ type: "bytes32" }, { type: "bytes32" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "floor", type: "uint32" }], name: "getPlayerHandles",    outputs: [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }], stateMutability: "view", type: "function" },
  { inputs: [],                                  name: "getSeasonHandles",    outputs: [{ type: "bytes32" }, { type: "bytes32" }], stateMutability: "view", type: "function" },

  { inputs: [], name: "getOccupiedFloors", outputs: [{ type: "uint32[]" }], stateMutability: "view", type: "function" },

  { inputs: [{ name: "sessionId", type: "uint64" }, { name: "addr", type: "address" }], name: "choicePublic",   outputs: [{ type: "uint8"   }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "sessionId", type: "uint64" }, { name: "addr", type: "address" }], name: "depositPublic",  outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "sessionId", type: "uint64" }, { name: "addr", type: "address" }], name: "payoutPublic",   outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },

  { inputs: [{ name: "floor", type: "uint32" }], name: "choicePublicCurrent",  outputs: [{ type: "uint8"   }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "floor", type: "uint32" }], name: "depositPublicCurrent", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "floor", type: "uint32" }], name: "payoutPublicCurrent",  outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },

  { inputs: [{ name: "addr", type: "address" }], name: "unclaimedTotal", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "treasuryPublic",        outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "nextPoolPublic",        outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "carriedInPublic",       outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "remainderToCarryPublic",outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" }, // ⬅️ NEW
  { inputs: [], name: "holdStreakBoost",       outputs: [{ type: "uint16" }],  stateMutability: "view", type: "function" },

  // Mutations
  {
    inputs: [
      { name: "nick",          type: "string"  },
      { name: "encDepositWei", type: "bytes32" },
      { name: "encChoice",     type: "bytes32" },
      { name: "proof",         type: "bytes"   },
    ],
    name: "join",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },

  { inputs: [], name: "startSession", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "runSession",    outputs: [], stateMutability: "nonpayable", type: "function" },

  {
    inputs: [
      { name: "addrs",        type: "address[]" },
      { name: "choiceCodes",  type: "uint8[]"   },
      { name: "depositWei",   type: "uint256[]" },
      { name: "payoutsWei",   type: "uint256[]" },
      { name: "treasuryWei",  type: "uint256"   },
      { name: "nextPoolWei",  type: "uint256"   },
      { name: "holdRemainderWei", type: "uint256" }, // ⬅️ NEW
    ],
    name: "publishResults",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  { inputs: [{ name: "sessionId", type: "uint64" }, { name: "amount", type: "uint256" }], name: "claim", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "claimUnclaimed", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount", type: "uint256" }], name: "claimTreasury", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "newHoldStreakBoost", type: "uint16" }], name: "startNextSeason", outputs: [], stateMutability: "nonpayable", type: "function" },

  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: "sessionId", type: "uint64" },
      { indexed: true,  name: "player",    type: "address" },
      { indexed: false, name: "floor",     type: "uint32" },
    ],
    name: "FloorAssigned",
    type: "event",
  },
  { anonymous: false, inputs: [{ indexed: true, name: "sessionId", type: "uint64" }], name: "ResultsReady",     type: "event" },
  { anonymous: false, inputs: [{ indexed: true, name: "sessionId", type: "uint64" }], name: "PayoutsPublished", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, name: "sessionId", type: "uint64" }], name: "ResultsPublished", type: "event" },
  { anonymous: false, inputs: [{ indexed: true,  name: "newSid", type: "uint64" }, { indexed: false, name: "amount", type: "uint256" }], name: "CarryOver", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, name: "to", type: "address" }, { indexed: false, name: "amount", type: "uint256" }], name: "TreasuryClaimed", type: "event" },
];
