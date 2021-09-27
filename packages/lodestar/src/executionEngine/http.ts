import {Bytes32, merge, Root, ExecutionAddress, PayloadId} from "@chainsafe/lodestar-types";
import {fromHexString, toHexString} from "@chainsafe/ssz";
import {JsonRpcHttpClient} from "../eth1/provider/jsonRpcHttpClient";
import {hexToNumber, numberToHex} from "../eth1/provider/utils";
import {IExecutionEngine} from "./interface";

/**
 * based on Ethereum JSON-RPC API and inherits the following properties of this standard:
 * - Supported communication protocols (HTTP and WebSocket)
 * - Message format and encoding notation
 * - Error codes improvement proposal
 *
 * Client software MUST expose Engine API at a port independent from JSON-RPC API. The default port for the Engine API is 8550 for HTTP and 8551 for WebSocket.
 * https://github.com/ethereum/execution-apis/blob/v1.0.0-alpha.1/src/engine/interop/specification.md
 */
export class ExecutionEngineHttp implements IExecutionEngine {
  constructor(private readonly rpc: JsonRpcHttpClient) {}

  /**
   * `engine_executePayload`
   *
   * 1. Client software MUST validate the payload according to the execution environment rule set with modifications to this rule set defined in the Block Validity section of EIP-3675 and respond with the validation result.
   * 2. Client software MUST defer persisting a valid payload until the corresponding engine_consensusValidated message deems the payload valid with respect to the proof-of-stake consensus rules.
   * 3. Client software MUST discard the payload if it's deemed invalid.
   * 4. The call MUST be responded with SYNCING status while the sync process is in progress and thus the execution cannot yet be validated.
   * 5. In the case when the parent block is unknown, client software MUST pull the block from the network and take one of the following actions depending on the parent block properties:
   * 6. If the parent block is a PoW block as per EIP-3675 definition, then all missing dependencies of the payload MUST be pulled from the network and validated accordingly. The call MUST be responded according to the validity of the payload and the chain of its ancestors.
   *    If the parent block is a PoS block as per EIP-3675 definition, then the call MAY be responded with SYNCING status and sync process SHOULD be initiated accordingly.
   */
  async executePayload(executionPayload: merge.ExecutionPayload): Promise<boolean> {
    const method = "engine_executePayload";
    const {status} = await this.rpc.fetch<
      EngineApiRpcReturnTypes[typeof method],
      EngineApiRpcParamTypes[typeof method]
    >({
      method,
      params: [serializeExecutionPayload(executionPayload)],
    });

    // TODO: Handle invalid status
    return status === ExecutePayloadStatus.VALID;
  }

  /**
   * `engine_consensusValidated`
   *
   * 1. The call of this method with VALID status maps on the POS_CONSENSUS_VALIDATED event of EIP-3675 and MUST be processed according to the specification defined in the EIP.
   * 2. If the status in this call is INVALID the payload MUST be discarded disregarding its validity with respect to the execution environment rules.
   * 3. Client software MUST respond with 4: Unknown block error if the payload identified by the blockHash is unknown.
   */
  notifyConsensusValidated(blockHash: Root, valid: boolean): Promise<void> {
    const method = "engine_consensusValidated";
    return this.rpc.fetch<EngineApiRpcReturnTypes[typeof method], EngineApiRpcParamTypes[typeof method]>({
      method,
      params: [{blockHash: toHexString(blockHash), status: valid ? "VALID" : "INVALID"}],
    });
  }

  /**
   * `engine_forkchoiceUpdated`
   *
   * 1. This method call maps on the POS_FORKCHOICE_UPDATED event of EIP-3675 and MUST be processed according to the specification defined in the EIP.
   * 2. Client software MUST respond with 4: Unknown block error if the payload identified by either the headBlockHash or the finalizedBlockHash is unknown.
   */
  notifyForkchoiceUpdate(headBlockHash: Root, finalizedBlockHash: Root): Promise<void> {
    const method = "engine_forkchoiceUpdated";
    return this.rpc.fetch<EngineApiRpcReturnTypes[typeof method], EngineApiRpcParamTypes[typeof method]>({
      method,
      params: [{headBlockHash: toHexString(headBlockHash), finalizedBlockHash: toHexString(finalizedBlockHash)}],
    });
  }

  /**
   * `engine_preparePayload`
   *
   * 1. Given provided field value set client software SHOULD build the initial version of the payload which has an empty transaction set.
   * 2. Client software SHOULD start the process of updating the payload. The strategy of this process is implementation dependent. The default strategy would be to keep the transaction set up-to-date with the state of local mempool.
   * 3. Client software SHOULD stop the updating process either by finishing to serve the engine_getPayload call with the same payloadId value or when SECONDS_PER_SLOT (currently set to 12 in the Mainnet configuration) seconds have passed since the point in time identified by the timestamp parameter.
   * 4. Client software MUST set the payload field values according to the set of parameters passed in the call to this method with exception for the feeRecipient. The coinbase field value MAY deviate from what is specified by the feeRecipient parameter.
   * 5. Client software SHOULD respond with 2: Action not allowed error if the sync process is in progress.
   * 6. Client software SHOULD respond with 4: Unknown block error if the parent block is unknown.
   */
  async preparePayload(
    parentHash: Root,
    timestamp: number,
    random: Bytes32,
    feeRecipient: ExecutionAddress
  ): Promise<PayloadId> {
    const method = "engine_preparePayload";
    const payloadId = await this.rpc.fetch<
      EngineApiRpcReturnTypes[typeof method],
      EngineApiRpcParamTypes[typeof method]
    >({
      method,
      params: [
        {
          parentHash: toHexString(parentHash),
          timestamp: numberToHex(timestamp),
          random: toHexString(random),
          feeRecipient: toHexString(feeRecipient),
        },
      ],
    });

    return hexToNumber(payloadId);
  }

  /**
   * `engine_getPayload`
   *
   * 1. Given the payloadId client software MUST respond with the most recent version of the payload that is available in the corresponding building process at the time of receiving the call.
   * 2. The call MUST be responded with 5: Unavailable payload error if the building process identified by the payloadId doesn't exist.
   * 3. Client software MAY stop the corresponding building process after serving this call.
   */
  async getPayload(payloadId: PayloadId): Promise<merge.ExecutionPayload> {
    const method = "engine_getPayload";
    const executionPayloadRpc = await this.rpc.fetch<
      EngineApiRpcReturnTypes[typeof method],
      EngineApiRpcParamTypes[typeof method]
    >({
      method,
      params: [payloadId],
    });

    return parseExecutionPayload(executionPayloadRpc);
  }
}

/* eslint-disable @typescript-eslint/naming-convention */

type EngineApiRpcParamTypes = {
  /**
   * 1. Object - Instance of ExecutionPayload
   */
  engine_executePayload: [ExecutionPayloadRpc];
  /**
   * 1. Object - Payload validity status with respect to the consensus rules:
   *   - blockHash: DATA, 32 Bytes - block hash value of the payload
   *   - status: String: VALID|INVALID - result of the payload validation with respect to the proof-of-stake consensus rules
   */
  engine_consensusValidated: [{blockHash: DATA; status: "VALID" | "INVALID"}];
  /**
   * 1. Object - The state of the fork choice:
   *   - headBlockHash: DATA, 32 Bytes - block hash of the head of the canonical chain
   *   - finalizedBlockHash: DATA, 32 Bytes - block hash of the most recent finalized block
   */
  engine_forkchoiceUpdated: [{headBlockHash: DATA; finalizedBlockHash: DATA}];
  /**
   * 1. Object - The payload attributes:
   */
  engine_preparePayload: [PayloadAttributes];
  /**
   * 1. payloadId: QUANTITY, 64 Bits - Identifier of the payload building process
   */
  engine_getPayload: [PayloadId];
};

type EngineApiRpcReturnTypes = {
  /**
   * Object - Response object:
   * - status: String - the result of the payload execution:
   */
  engine_executePayload: {status: ExecutePayloadStatus};
  engine_consensusValidated: void;
  engine_forkchoiceUpdated: void;
  /**
   * payloadId | Error: QUANTITY, 64 Bits - Identifier of the payload building process
   */
  engine_preparePayload: PayloadIdStr | RpcError;
  engine_getPayload: ExecutionPayloadRpc;
};

type PayloadIdStr = string;
type RpcError = string;
/** "0x" prefixed hex encoded binary data */
type HexStr = string;
/** Hex encoded binary data */
type DATA = HexStr;
/** Hex encoded big-endian number */
type QUANTITY = HexStr;

enum ExecutePayloadStatus {
  /** given payload is valid */
  VALID = "VALID",
  /** given payload is invalid */
  INVALID = "INVALID",
  /** sync process is in progress */
  SYNCING = "SYNCING",
}

type PayloadAttributes = {
  /** DATA, 32 Bytes - hash of the parent block */
  parentHash: DATA;
  /** QUANTITY, 64 Bits - value for the timestamp field of the new payload */
  timestamp: QUANTITY;
  /** DATA, 32 Bytes - value for the random field of the new payload */
  random: DATA;
  /** DATA, 20 Bytes - suggested value for the coinbase field of the new payload */
  feeRecipient: DATA;
};

type ExecutionPayloadRpc = {
  parentHash: DATA;
  coinbase: DATA;
  stateRoot: DATA;
  receiptRoot: DATA;
  logsBloom: DATA;
  random: DATA;
  blockNumber: QUANTITY;
  gasLimit: QUANTITY;
  gasUsed: QUANTITY;
  timestamp: QUANTITY;
  extraData: DATA;
  baseFeePerGas: QUANTITY;
  blockHash: DATA;
  transactions: DATA[];
};

function serializeExecutionPayload(data: merge.ExecutionPayload): ExecutionPayloadRpc {
  return {
    parentHash: toHexString(data.parentHash),
    coinbase: toHexString(data.coinbase),
    stateRoot: toHexString(data.stateRoot),
    receiptRoot: toHexString(data.receiptRoot),
    logsBloom: toHexString(data.logsBloom),
    random: toHexString(data.random),
    blockNumber: numberToHex(data.blockNumber),
    gasLimit: numberToHex(data.gasLimit),
    gasUsed: numberToHex(data.gasUsed),
    timestamp: numberToHex(data.timestamp),
    extraData: toHexString(data.extraData),
    // TODO: Review big-endian
    baseFeePerGas: toHexString(data.baseFeePerGas),
    blockHash: toHexString(data.blockHash),
    transactions: data.transactions.map(toHexString),
  };
}

function parseExecutionPayload(data: ExecutionPayloadRpc): merge.ExecutionPayload {
  return {
    parentHash: fromHexString(data.parentHash),
    coinbase: fromHexString(data.coinbase),
    stateRoot: fromHexString(data.stateRoot),
    receiptRoot: fromHexString(data.receiptRoot),
    logsBloom: fromHexString(data.logsBloom),
    random: fromHexString(data.random),
    blockNumber: hexToNumber(data.blockNumber),
    gasLimit: hexToNumber(data.gasLimit),
    gasUsed: hexToNumber(data.gasUsed),
    timestamp: hexToNumber(data.timestamp),
    extraData: fromHexString(data.extraData),
    // TODO: Review big-endian
    baseFeePerGas: fromHexString(data.baseFeePerGas),
    blockHash: fromHexString(data.blockHash),
    transactions: data.transactions.map(fromHexString),
  };
}
