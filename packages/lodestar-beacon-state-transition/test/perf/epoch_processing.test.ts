import {config} from "@chainsafe/lodestar-config/lib/presets/mainnet";
import {BeaconState} from "@chainsafe/lodestar-types";
import {WinstonLogger} from "@chainsafe/lodestar-utils";
import {IEpochProcess, prepareEpochProcessState} from "../../src/fast/util";
import {EpochContext, StateTransitionEpochContext} from "../../src/fast/util/epochContext";
import {
  processFinalUpdates,
  processJustificationAndFinalization,
  processRegistryUpdates,
  processRewardsAndPenalties,
  processSlashings,
  processForkChanged,
} from "../../src/fast/epoch";
import {loadPerformanceState} from "./util";
import {initBLS} from "@chainsafe/bls";
import {expect} from "chai";

describe.only("Epoch Processing Performance Tests", function () {
  let state: BeaconState;
  let epochCtx: StateTransitionEpochContext;
  let process: IEpochProcess;
  const logger = new WinstonLogger();

  before(async function () {
    this.timeout(0);
    await initBLS();
    state = await loadPerformanceState();
    // go back 1 slot to process epoch
    state.slot -= 1;
    epochCtx = new EpochContext(config);
    epochCtx.loadState(state);
  });

  it("prepareEpochProcessState", async () => {
    const start = Date.now();
    logger.profile("prepareEpochProcessState");
    process = prepareEpochProcessState(epochCtx, state);
    logger.profile("prepareEpochProcessState");
    expect(Date.now() - start).lt(1300);
  });

  it("processJustificationAndFinalization", async () => {
    const start = Date.now();
    logger.profile("processJustificationAndFinalization");
    processJustificationAndFinalization(epochCtx, process, state);
    logger.profile("processJustificationAndFinalization");
    expect(Date.now() - start).lt(2);
  });

  it("processRewardsAndPenalties", async () => {
    const start = Date.now();
    logger.profile("processRewardsAndPenalties");
    processRewardsAndPenalties(epochCtx, process, state);
    logger.profile("processRewardsAndPenalties");
    expect(Date.now() - start).lt(460);
  });

  it("processRegistryUpdates", async () => {
    const start = Date.now();
    logger.profile("processRegistryUpdates");
    processRegistryUpdates(epochCtx, process, state);
    logger.profile("processRegistryUpdates");
    expect(Date.now() - start).lt(2);
  });

  it("processSlashings", async () => {
    const start = Date.now();
    logger.profile("processSlashings");
    processSlashings(epochCtx, process, state);
    logger.profile("processSlashings");
    expect(Date.now() - start).lt(20);
  });

  it("processFinalUpdates", async () => {
    const start = Date.now();
    logger.profile("processFinalUpdates");
    processFinalUpdates(epochCtx, process, state);
    logger.profile("processFinalUpdates");
    expect(Date.now() - start).lt(250);
  });

  it("processForkChanged", async () => {
    const start = Date.now();
    logger.profile("processForkChanged");
    processForkChanged(epochCtx, process, state);
    logger.profile("processForkChanged");
    expect(Date.now() - start).lt(2);
  });
});
