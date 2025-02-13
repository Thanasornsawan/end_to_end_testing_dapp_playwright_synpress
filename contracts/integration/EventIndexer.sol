// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title EventIndexer
 * @notice Indexes and tracks events for off-chain processing and database integration
 */
contract EventIndexer is AccessControl {
    bytes32 public constant INDEXER_ROLE = keccak256("INDEXER_ROLE");

    struct IndexedEvent {
        bytes32 eventId;
        address contractAddress;
        bytes4 functionSelector;
        uint256 blockNumber;
        uint256 timestamp;
        bytes data;
        bool processed;
    }

    // Mappings for event tracking
    mapping(bytes32 => IndexedEvent) public indexedEvents;
    mapping(address => uint256) public lastProcessedBlock;
    mapping(bytes32 => string) public eventSignatures;

    // Events
    event EventIndexed(
        bytes32 indexed eventId,
        address indexed contractAddress,
        bytes4 indexed functionSelector,
        uint256 blockNumber,
        bytes data
    );

    event EventProcessed(
        bytes32 indexed eventId,
        bool success,
        string message
    );

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(INDEXER_ROLE, msg.sender);
    }

    /**
     * @notice Index a new event
     * @param contractAddress Address of the contract emitting the event
     * @param functionSelector Function selector of the event
     * @param data Event data
     * @return eventId Unique identifier for the indexed event
     */
    function indexEvent(
        address contractAddress,
        bytes4 functionSelector,
        bytes calldata data
    ) external onlyRole(INDEXER_ROLE) returns (bytes32) {
        bytes32 eventId = keccak256(
            abi.encodePacked(
                contractAddress,
                functionSelector,
                block.number,
                block.timestamp,
                data
            )
        );

        indexedEvents[eventId] = IndexedEvent({
            eventId: eventId,
            contractAddress: contractAddress,
            functionSelector: functionSelector,
            blockNumber: block.number,
            timestamp: block.timestamp,
            data: data,
            processed: false
        });

        emit EventIndexed(
            eventId,
            contractAddress,
            functionSelector,
            block.number,
            data
        );

        return eventId;
    }

    /**
     * @notice Mark an event as processed
     * @param eventId ID of the event to mark as processed
     * @param success Whether the processing was successful
     * @param message Processing result message
     */
    function markEventProcessed(
        bytes32 eventId,
        bool success,
        string calldata message
    ) external onlyRole(INDEXER_ROLE) {
        require(indexedEvents[eventId].eventId == eventId, "Event not found");
        require(!indexedEvents[eventId].processed, "Event already processed");

        indexedEvents[eventId].processed = true;
        lastProcessedBlock[indexedEvents[eventId].contractAddress] = block.number;

        emit EventProcessed(eventId, success, message);
    }

    /**
     * @notice Register event signature for better off-chain parsing
     * @param functionSelector Function selector
     * @param signature Event signature string
     */
    function registerEventSignature(
        bytes4 functionSelector,
        string calldata signature
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        eventSignatures[bytes32(functionSelector)] = signature;
    }

    /**
     * @notice Get events in a block range
     * @param contractAddress Contract address to filter events
     * @param fromBlock Starting block
     * @param toBlock Ending block
     * @return eventIds Array of event IDs in the range
     */
    function getEventsInRange(
        address contractAddress,
        uint256 fromBlock,
        uint256 toBlock
    ) external view returns (bytes32[] memory eventIds) {
        require(toBlock >= fromBlock, "Invalid block range");
        
        // Note: This is a simplified implementation
        // In practice, you'd want to implement pagination
        uint256 count = 0;
        bytes32[] memory tempEventIds = new bytes32[](1000); // Max 1000 events

        for (uint256 i = fromBlock; i <= toBlock && count < 1000; i++) {
            bytes32 eventId = keccak256(abi.encodePacked(contractAddress, i));
            if (indexedEvents[eventId].blockNumber > 0) {
                tempEventIds[count] = eventId;
                count++;
            }
        }

        // Create properly sized array
        eventIds = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            eventIds[i] = tempEventIds[i];
        }

        return eventIds;
    }

    /**
     * @notice Get full event details
     * @param eventId Event identifier
     * @return IndexedEvent struct containing event details
     */
    function getEventDetails(bytes32 eventId) 
        external 
        view 
        returns (IndexedEvent memory) 
    {
        require(indexedEvents[eventId].eventId == eventId, "Event not found");
        return indexedEvents[eventId];
    }

    /**
     * @notice Get last processed block for a contract
     * @param contractAddress Contract address
     * @return uint256 Last processed block number
     */
    function getLastProcessedBlock(address contractAddress) 
        external 
        view 
        returns (uint256) 
    {
        return lastProcessedBlock[contractAddress];
    }
}