import Router from "@koa/router";
import {Benchmark} from "redstone-smartweave";

export async function analyticsRoute(ctx: Router.RouterContext) {
  const {logger, gatewayDb} = ctx;

  try {
    const benchmark = Benchmark.measure();
    // transactions count, contracts count, corrupted count, confirmed count,
    const resultTotals: any = await gatewayDb.raw(
      `   
          SELECT
            count(interaction)                                                      AS interactions,
            count(case when confirmation_status = 'corrupted' then 1 else null end) AS corrupted,
            count(case when confirmation_status = 'confirmed' then 1 else null end) AS confirmed
          FROM interactions
          WHERE contract_id != ''
      `
    );
    // users total
    const resultUsers: any = await gatewayDb.raw(
      `   
          SELECT COUNT(*) FROM (SELECT DISTINCT interaction -> 'owner' -> 'address' AS address FROM interactions WHERE contract_id != '') AS temp
      `
    );
    // top 100 contracts
    const resultTopContracts: any = await gatewayDb.raw(
      `          
          SELECT contract_id                                                        AS contract,
            count(interaction)                                                      AS interactions,
            count(case when confirmation_status = 'corrupted' then 1 else null end) AS corrupted,
            count(case when confirmation_status = 'confirmed' then 1 else null end) AS confirmed,
            max(block_height)                                                       AS last_interaction_height,
            count(*) OVER ()                                                        AS total
          FROM interactions
          WHERE contract_id != ''
          GROUP BY contract_id
          ORDER BY count(interaction) DESC, interactions DESC
          LIMIT 100
      `
    );

    ctx.body = {
      totals: resultTotals?.rows,
      users:resultUsers?.rows,
      top:resultTopContracts?.rows
    };
    
    logger.debug("Contracts loaded in", benchmark.elapsed());
  } catch (e: any) {
    ctx.logger.error(e);
    ctx.status = 500;
    ctx.body = {message: e};
  }
}
