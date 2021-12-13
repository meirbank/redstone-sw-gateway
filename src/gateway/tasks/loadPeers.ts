import Application from "koa";
import {PeerList} from "arweave/node/network";
import {Benchmark} from "redstone-smartweave";
import axios from "axios";

const MAX_ARWEAVE_PEER_INFO_TIMEOUT_MS = 3000;
const PEERS_CHECK_INTERVAL_MS = 1000 * 60 * 60;

export async function runLoadPeersTask(context: Application.BaseContext) {
  const {gatewayLogger: logger} = context;
  const currentPeers: { peer: string }[] = await context.gatewayDb('peers').select('peer');
  if (currentPeers.length < 500) {
    logger.info("Pre-loading peers...");
    await loadPeers(context);
  }

  logger.info("Starting [loadPeers] task.");

  // Hmm, why not use `setInterval` instead?
  // I think this approach (with recursive calls) can also result in
  // increased memory usage
  (function loadPeersTask() {
    setTimeout(async function () {
      // this operation takes quite a lot of time, so we're not blocking the rest of the node operation
      loadPeers(context)
        .then(() => {
          context.logger.info("Peers check complete");
        })
        .catch(r => {
          context.logger.error("Peers check failed", r.reason);
        });
      loadPeersTask();
    }, PEERS_CHECK_INTERVAL_MS);
  })();
}

export async function loadPeers(context: Application.BaseContext) {
  const {gatewayLogger: logger, arweave, gatewayDb} = context;

  logger.info("Updating peers...");

  let newPeers: PeerList = [];
  // Do we really need this try cactch?
  // In case of errors it will end this functions gracefully and
  // will print "Peers check complete" (which is not true)
  try {
    newPeers = await arweave.network.getPeers();
  } catch (e) {
    logger.error("Error from Arweave while loading peers", e);
    return; // can we throw e here instead of calling return
  }

  const currentPeers: { peer: string }[] = await gatewayDb('peers').select('peer');

  const peersToRemove: string[] = [];
  currentPeers.forEach(currentPeer => {
    if (!newPeers.find(peer => currentPeer.peer === peer)) {
      peersToRemove.push(currentPeer.peer);
    }
  });

  logger.debug("Removing no longer available peers", peersToRemove);

  // I'd rename removed to removedCount. What do you think?
  const removed = await gatewayDb("peers")
    .whereIn("peer", peersToRemove)
    .delete();

  logger.debug(`Removed ${removed} elements.`);

  for (const peer of newPeers) {
    logger.debug(`Checking Arweave peer ${peer} [${(newPeers.indexOf(peer) + 1)} / ${newPeers.length}]`);
    try {
      // For me it's a bit misleading that you use Benchmark module from the redstone-smartweave module
      // Maybe we can create a separate NPM module for benchmarking or check if there are ready solutions
      const benchmark = Benchmark.measure();
      const result = await axios.get(`http://${peer}/info`, {
        timeout: MAX_ARWEAVE_PEER_INFO_TIMEOUT_MS
      });
      const elapsed = benchmark.elapsed(true);
      await gatewayDb("peers")
        .insert({
          peer: peer,
          blocks: result.data.blocks,
          height: result.data.height,
          response_time: elapsed,
          blacklisted: false,
        })
        .onConflict(["peer"])
        .merge();
    } catch (e: any) {
      logger.error(`Error from ${peer}`, e.message);
      await gatewayDb("peers")
        .insert({
          peer: peer,
          blocks: 0,
          height: 0,
          response_time: 0,
          blacklisted: true,
        })
        .onConflict(["peer"])
        .merge();
    }
  }
}
