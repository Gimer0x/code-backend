// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract Counter {
    uint256 public count;

    event Increment(address indexed who, uint256 newCount);
    event Decrement(address indexed who, uint256 newCount);

    function get() external view returns (uint256) {
        return count;
    }

    function inc() external {
            count += 1;
        emit Increment(msg.sender, count);
    }

    function dec() external {
        count -= 1;
        emit Decrement(msg.sender, count);
    }
}