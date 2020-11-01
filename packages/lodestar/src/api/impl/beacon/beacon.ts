/**
 * @module api/rpc
 */

import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {
  BLSPubkey,
  ForkResponse,
  Genesis,
  SignedBeaconBlock,
  Uint64,
  ValidatorResponse,
} from "@chainsafe/lodestar-types";

import {ChainEvent, IBeaconChain} from "../../../chain";
import {IApiOptions} from "../../options";
import {IBeaconDb} from "../../../db/api";
import {IBeaconSync} from "../../../sync";
import {ApiNamespace, IApiModules} from "../interface";
import {BeaconBlockApi, IBeaconBlocksApi} from "./blocks";
import {BeaconPoolApi, IBeaconPoolApi} from "./pool";
import {IBeaconStateApi} from "./state/interface";
import {BeaconStateApi} from "./state/state";
import {IBeaconApi} from "./interface";
import {LodestarEventIterator} from "@chainsafe/lodestar-utils";

export class BeaconApi implements IBeaconApi {
  public namespace: ApiNamespace;
  public state: IBeaconStateApi;
  public blocks: IBeaconBlocksApi;
  public pool: IBeaconPoolApi;

  private readonly config: IBeaconConfig;
  private readonly chain: IBeaconChain;
  private readonly db: IBeaconDb;
  private readonly sync: IBeaconSync;

  public constructor(
    opts: Partial<IApiOptions>,
    modules: Pick<IApiModules, "config" | "chain" | "db" | "network" | "sync">
  ) {
    this.namespace = ApiNamespace.BEACON;
    this.config = modules.config;
    this.chain = modules.chain;
    this.db = modules.db;
    this.sync = modules.sync;
    this.state = new BeaconStateApi(opts, modules);
    this.blocks = new BeaconBlockApi(opts, modules);
    this.pool = new BeaconPoolApi(opts, modules);
  }

  public async getValidator(pubkey: BLSPubkey): Promise<ValidatorResponse | null> {
    const {epochCtx, state} = await this.chain.getHeadStateContext();
    const index = epochCtx.pubkey2index.get(pubkey);
    if (index) {
      return {
        validator: state.validators[index],
        balance: state.balances[index],
        pubkey: pubkey,
        index,
      };
    } else {
      return null;
    }
  }

  public async getGenesis(): Promise<Genesis | null> {
    const state = await this.chain.getHeadState();
    if (state) {
      return {
        genesisForkVersion: this.config.params.GENESIS_FORK_VERSION,
        genesisTime: BigInt(state.genesisTime),
        genesisValidatorsRoot: state.genesisValidatorsRoot,
      };
    }
    return null;
  }

  public getBlockStream(): LodestarEventIterator<SignedBeaconBlock> {
    return new LodestarEventIterator<SignedBeaconBlock>(({push}) => {
      this.chain.emitter.on(ChainEvent.block, push);
      return () => {
        this.chain.emitter.off(ChainEvent.block, push);
      };
    });
  }
}
