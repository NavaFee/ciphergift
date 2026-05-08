/**
 * Withdrawal lifecycle for ConfidentialETHVault: requested → fulfilled |
 * cancelled. The reqId is the entity primary key, so a request can
 * transition status without creating duplicate rows.
 */
import {
  WithdrawCancelled,
  WithdrawFulfilled,
  WithdrawRequested,
} from "../generated/ConfidentialETHVault/ConfidentialETHVault";
import { Withdrawal } from "../generated/schema";

export function handleWithdrawRequested(event: WithdrawRequested): void {
  const id = event.params.reqId.toString();
  let w = Withdrawal.load(id);
  if (w == null) w = new Withdrawal(id);
  w.user = event.params.user;
  w.status = "requested";
  w.requestedAtBlock = event.block.number;
  w.save();
}

export function handleWithdrawFulfilled(event: WithdrawFulfilled): void {
  const id = event.params.reqId.toString();
  let w = Withdrawal.load(id);
  if (w == null) {
    // Out-of-order replay: synthesize the request row so we don't lose the record.
    w = new Withdrawal(id);
    w.user = event.params.user;
    w.requestedAtBlock = event.block.number;
  }
  w.status = "fulfilled";
  w.resolvedAtBlock = event.block.number;
  w.units = event.params.units;
  w.weiAmount = event.params.weiAmount;
  w.save();
}

export function handleWithdrawCancelled(event: WithdrawCancelled): void {
  const id = event.params.reqId.toString();
  let w = Withdrawal.load(id);
  if (w == null) {
    w = new Withdrawal(id);
    w.user = event.params.user;
    w.requestedAtBlock = event.block.number;
  }
  w.status = "cancelled";
  w.resolvedAtBlock = event.block.number;
  w.save();
}
