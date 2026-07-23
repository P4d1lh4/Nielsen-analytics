import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrivateIp, assertPublicUrl, BlockedUrlError } from "./urlGuard";

test("isPrivateIp flags loopback/private/link-local/ULA/CGNAT", () => {
  for (const ip of [
    "0.0.0.0",
    "10.1.2.3",
    "127.0.0.1",
    "169.254.169.254", // cloud metadata
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "100.64.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12::1",
    "::ffff:127.0.0.1",
  ]) {
    assert.equal(isPrivateIp(ip), true, `${ip} should be private`);
  }
});

test("isPrivateIp allows public addresses", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "100.63.0.1", "2606:4700::1", "::ffff:8.8.8.8"]) {
    assert.equal(isPrivateIp(ip), false, `${ip} should be public`);
  }
});

// assertPublicUrl on IP literals resolves offline (no network).
test("assertPublicUrl rejects non-http schemes", async () => {
  await assert.rejects(assertPublicUrl("file:///etc/passwd"), BlockedUrlError);
  await assert.rejects(assertPublicUrl("ftp://8.8.8.8/"), BlockedUrlError);
});

test("assertPublicUrl rejects internal addresses", async () => {
  await assert.rejects(assertPublicUrl("http://127.0.0.1/"), BlockedUrlError);
  await assert.rejects(assertPublicUrl("http://169.254.169.254/latest/meta-data/"), BlockedUrlError);
  await assert.rejects(assertPublicUrl("http://[::1]/"), BlockedUrlError);
  await assert.rejects(assertPublicUrl("http://2130706433/"), BlockedUrlError); // decimal 127.0.0.1
});

test("assertPublicUrl rejects malformed URLs", async () => {
  await assert.rejects(assertPublicUrl("not a url"), BlockedUrlError);
});

test("assertPublicUrl allows a public IP literal", async () => {
  await assert.doesNotReject(assertPublicUrl("http://8.8.8.8/"));
});
