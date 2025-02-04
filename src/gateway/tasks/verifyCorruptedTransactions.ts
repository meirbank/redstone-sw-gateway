import {TaskRunner} from "./TaskRunner";
import {MIN_CONFIRMATIONS} from "./verifyInteractions";
import {GatewayContext} from "../init";

const CORRUPTED_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 4;

export async function runVerifyCorruptedTransactionsTask(context: GatewayContext) {
  await TaskRunner
    .from("[corrupted transactions check]", verifyCorruptedTransactions, context)
    .runAsyncEvery(CORRUPTED_CHECK_INTERVAL_MS);
}

async function verifyCorruptedTransactions(context: GatewayContext) {
  const {arweave, logger, gatewayDb} = context;

  let corruptedTransactions: { id: string; }[];

  try {
    corruptedTransactions = (await gatewayDb.raw(`
        SELECT interaction_id as id
        FROM interactions
        WHERE confirmation_status = 'corrupted';
    `)).rows;
  } catch (e: any) {
    logger.error('Error while checking corrupted transactions', e.message);
    return;
  }

  logger.debug(`Rechecking ${corruptedTransactions.length} corrupted transactions`);

  for (const corrupted of corruptedTransactions) {
    try {
      const result = await arweave.transactions.getStatus(corrupted.id);
      if (result.status !== 404
        && result
        && result.confirmed
        && result.confirmed.number_of_confirmations >= MIN_CONFIRMATIONS) {
        logger.warn(`Transaction ${corrupted.id} is probably not corrupted, confirmations ${result.confirmed.number_of_confirmations}`);

        // returning transaction to "not_processed" pool.
        await gatewayDb("interactions")
          .where("interaction_id", corrupted.id)
          .update({
            confirmation_status: 'not_processed',
            confirming_peer: null,
            confirmations: null
          });

      } else {
        logger.info(`Transaction ${corrupted.id} confirmed as corrupted`);
      }
    } catch (e) {
      logger.error(`Error while verifying ${corrupted.id}`);
    }
  }


  logger.info("Corrupted transactions confirmation done.");
}
