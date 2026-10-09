// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getClientNetwork } from '../../src/utils/client-network.js';

describe('Client networks for throttling', () => {
  it('should group IPv6 addresses and equivalent spellings by their first 64 bits', () => {
    for (const address of ['2001:db8:1234:abcd::1', '2001:db8:1234:abcd::ffff', '2001:0DB8:1234:ABCD:0000:0000:0000:0001']) {
      assert.equal(getClientNetwork(address), '2001:0db8:1234:abcd::/64');
    }
    assert.equal(getClientNetwork('2001:db8:1234:abce::1'), '2001:0db8:1234:abce::/64');
  });

  it('should expand compressed prefixes, embedded IPv4 and scoped IPv6 addresses', () => {
    for (const { address, expectedNetwork } of [
      { address: '::1', expectedNetwork: '0000:0000:0000:0000::/64' },
      { address: '2001:db8:1::1', expectedNetwork: '2001:0db8:0001:0000::/64' },
      { address: '2001:db8:0:1::', expectedNetwork: '2001:0db8:0000:0001::/64' },
      { address: '64:ff9b::192.0.2.1', expectedNetwork: '0064:ff9b:0000:0000::/64' },
      { address: 'fe80::1%eth0', expectedNetwork: 'fe80:0000:0000:0000::/64' },
    ]) {
      assert.equal(getClientNetwork(address), expectedNetwork);
    }
  });

  it('should preserve separate IPv4 clients and normalize IPv4-mapped IPv6 forms', () => {
    for (const address of ['192.0.2.10', '::ffff:192.0.2.10', '::FFFF:c000:020a', '0:0:0:0:0:ffff:c000:20a']) {
      assert.equal(getClientNetwork(address), '192.0.2.10');
    }
    assert.equal(getClientNetwork('::ffff:192.0.2.11'), '192.0.2.11');
  });

  it('should preserve missing-address placeholders and invalid inputs safely', () => {
    for (const address of ['unknown', '', 'invalid-address', '2001:db8::invalid']) {
      assert.equal(getClientNetwork(address), address);
    }
  });
});
