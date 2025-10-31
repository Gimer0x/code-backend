// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "forge-std/Test.sol";
import "../src/Events.sol";

contract EventsTest is Test {
    Events public counter;

    function setUp() public {
        counter = new Events();
    }

    function testInitialZero() public {
        assertEq(counter.get(), 0);
        assertEq(counter.count(), 0);
    }

    function testInc() public {
        counter.inc();
        assertEq(counter.get(), 1);
    }

    function testDec() public {
        counter.inc(); // now 1
        counter.dec(); // back to 0
        assertEq(counter.get(), 0);
    }

    function testUnderflowReverts() public {
        try counter.dec() {
            fail();
        } catch {
            assertEq(counter.get(), 0);
        }
    }
}