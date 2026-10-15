import { strict as assert } from "node:assert";
import test from "node:test";
import { discoveryProspectReason, usesChannelMatchForDiscovery } from "../visit-copilot.service";

test("Water Cash Van does not use copied rep channel for score or reason", () => {
  const channelMatch = usesChannelMatchForDiscovery("WATER_CASH_VAN") && true;
  assert.equal(channelMatch, false);
  assert.equal(discoveryProspectReason(channelMatch, 1.25), "قريب من مركز عملائك (1.25 كم).");
  assert.doesNotMatch(discoveryProspectReason(channelMatch, null), /قناته مطابقة لقناتك/);
});

test("REP_CHANNEL keeps its existing channel-match behavior", () => {
  const channelMatch = usesChannelMatchForDiscovery("REP_CHANNEL") && true;
  assert.equal(channelMatch, true);
  assert.match(discoveryProspectReason(channelMatch, null), /قناته مطابقة لقناتك/);
});
