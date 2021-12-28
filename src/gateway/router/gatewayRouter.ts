import Router from "@koa/router";
import {contractsRoute} from "./routes/contractsRoute";
import {interactionsRoute} from "./routes/interactionsRoute";
import {searchContractsRoute} from "./routes/searchContractsRoute";
import {analyticsRoute} from "./routes/analyticsRoute";

const gatewayRouter = new Router({prefix: '/gateway'});

gatewayRouter.get("/contracts", contractsRoute);
gatewayRouter.get("/contracts/search/:phrase", searchContractsRoute);
gatewayRouter.get("/interactions", interactionsRoute);
gatewayRouter.get("/analytics", analyticsRoute);

export default gatewayRouter;
