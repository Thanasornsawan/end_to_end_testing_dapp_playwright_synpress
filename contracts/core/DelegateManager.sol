// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "../interfaces/IWETH.sol";
import "./EnhancedLendingProtocol.sol";

/**
 * @title DelegateManager
 * @notice Manages borrowing delegation for the EnhancedLendingProtocol
 * @dev Includes security features like delegation caps, required staking, and multisig support
 */
contract DelegateManager is ReentrancyGuard, Ownable {
    using ECDSA for bytes32;
    using EnumerableSet for EnumerableSet.AddressSet;

    // Constants
    uint256 public constant REQUIRED_STAKE_PERCENTAGE = 1000; // 10% in basis points
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MAX_DELEGATES_PER_OWNER = 5;
    
    // State variables
    EnhancedLendingProtocol public lendingProtocol;
    IERC20 public stakingToken; // Typically WETH

    // Delegation types
    enum DelegationType {
        INDIVIDUAL,  // Single delegate
        CONTRACT,    // Smart contract delegate
        MULTISIG     // Multiple delegates with threshold
    }

    // Delegation struct
    struct Delegation {
        DelegationType delegationType;
        uint256 maxBorrowAmount;   // Max amount this delegate can borrow
        uint256 stakedAmount;      // Amount staked as security 
        uint256 threshold;         // Number of required signatures for multisig
        bool active;               // Whether delegation is active
    }

    // Delegation approvals
    mapping(address => mapping(address => Delegation)) public delegations; // owner => delegate => delegation
    
    // Track delegates for each owner
    mapping(address => EnumerableSet.AddressSet) private ownerDelegates;
    
    // Multisig delegations
    mapping(address => mapping(bytes32 => mapping(address => bool))) public multisigApprovals; // owner => operationHash => delegate => approved
    mapping(address => mapping(bytes32 => uint256)) public multisigApprovalCount; // owner => operationHash => count
    mapping(address => mapping(bytes32 => bool)) public executedOperations; // owner => operationHash => executed
    
    // Nonce for each delegate to prevent replay attacks
    mapping(address => uint256) public nonces;

    // Events
    event DelegationCreated(
        address indexed owner, 
        address indexed delegate, 
        DelegationType delegationType, 
        uint256 maxBorrowAmount, 
        uint256 stakedAmount,
        uint256 threshold
    );
    event DelegationRevoked(address indexed owner, address indexed delegate);
    event DelegateStakeIncreased(address indexed owner, address indexed delegate, uint256 amount);
    event DelegateStakeDecreased(address indexed owner, address indexed delegate, uint256 amount);
    event DelegateBorrowExecuted(
        address indexed owner, 
        address indexed delegate, 
        address token, 
        uint256 amount
    );
    event MultisigApproval(
        address indexed owner, 
        address indexed delegate, 
        bytes32 operationHash
    );
    event MultisigBorrowExecuted(
        address indexed owner,
        bytes32 operationHash,
        address token,
        uint256 amount
    );
    
    // Constructor
    constructor(address _lendingProtocol, address _stakingToken) {
        require(_lendingProtocol != address(0), "Invalid lending protocol address");
        require(_stakingToken != address(0), "Invalid staking token address");
        
        // Cast address to payable address before converting to contract type
        address payable lendingProtocolPayable = payable(_lendingProtocol);
        lendingProtocol = EnhancedLendingProtocol(lendingProtocolPayable);
        stakingToken = IERC20(_stakingToken);
    }
    
    /**
     * @notice Create a delegation to allow a delegate to borrow on owner's behalf
     * @param delegate The address to delegate borrowing rights to
     * @param delegationType The type of delegation (individual, contract, multisig)
     * @param maxBorrowAmount The maximum amount the delegate can borrow
     * @param threshold The number of required signatures for multisig (ignored for other types)
     */
    function createDelegation(
        address delegate, 
        DelegationType delegationType,
        uint256 maxBorrowAmount,
        uint256 threshold
    ) external nonReentrant {
        require(delegate != address(0), "Invalid delegate address");
        require(maxBorrowAmount > 0, "Amount must be > 0");
        require(ownerDelegates[msg.sender].length() < MAX_DELEGATES_PER_OWNER, "Max delegates reached");
        
        // For multisig, ensure threshold is valid
        if (delegationType == DelegationType.MULTISIG) {
            require(threshold > 0, "Threshold must be > 0");
        } else {
            threshold = 1; // Default for non-multisig
        }
        
        // Calculate required stake amount
        uint256 requiredStake = maxBorrowAmount * REQUIRED_STAKE_PERCENTAGE / BASIS_POINTS;
        
        // Transfer stake from delegate
        require(
            stakingToken.transferFrom(delegate, address(this), requiredStake),
            "Stake transfer failed"
        );
        
        // Create delegation
        delegations[msg.sender][delegate] = Delegation({
            delegationType: delegationType,
            maxBorrowAmount: maxBorrowAmount,
            stakedAmount: requiredStake,
            threshold: threshold,
            active: true
        });
        
        // Add to delegate set
        ownerDelegates[msg.sender].add(delegate);
        
        emit DelegationCreated(
            msg.sender, 
            delegate, 
            delegationType, 
            maxBorrowAmount, 
            requiredStake,
            threshold
        );
    }
    
    /**
     * @notice Revoke a delegation
     * @param delegate The delegate to revoke
     */
    function revokeDelegation(address delegate) external nonReentrant {
        require(delegate != address(0), "Invalid delegate address");
        require(ownerDelegates[msg.sender].contains(delegate), "Delegation doesn't exist");
        
        Delegation storage delegation = delegations[msg.sender][delegate];
        require(delegation.active, "Delegation already inactive");
        
        // Return staked amount to delegate
        require(
            stakingToken.transfer(delegate, delegation.stakedAmount),
            "Stake return failed"
        );
        
        // Deactivate delegation
        delegation.active = false;
        ownerDelegates[msg.sender].remove(delegate);
        
        emit DelegationRevoked(msg.sender, delegate);
    }
    
    /**
     * @notice Increase the stake for a delegation
     * @param owner The owner of the delegation
     * @param amount The amount to increase the stake by
     */
    function increaseStake(address owner, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(ownerDelegates[owner].contains(msg.sender), "Not a delegate");
        
        Delegation storage delegation = delegations[owner][msg.sender];
        require(delegation.active, "Delegation not active");
        
        // Transfer additional stake
        require(
            stakingToken.transferFrom(msg.sender, address(this), amount),
            "Stake transfer failed"
        );
        
        // Update delegation
        delegation.stakedAmount += amount;
        
        emit DelegateStakeIncreased(owner, msg.sender, amount);
    }
    
    /**
     * @notice Individual delegate borrows on behalf of owner
     * @param owner The owner to borrow on behalf of
     * @param token The token to borrow
     * @param amount The amount to borrow
     */
    function borrowOnBehalf(
        address owner,
        address token,
        uint256 amount
    ) external nonReentrant {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be > 0");
        
        // Validate delegation
        Delegation memory delegation = delegations[owner][msg.sender];
        require(delegation.active, "Delegation not active");
        require(delegation.delegationType == DelegationType.INDIVIDUAL, "Wrong delegation type");
        require(amount <= delegation.maxBorrowAmount, "Amount exceeds delegation cap");
        
        // Execute borrow via lending protocol
        executeBorrow(owner, token, amount);
        
        emit DelegateBorrowExecuted(owner, msg.sender, token, amount);
    }
    
    /**
     * @notice Contract delegate borrows on behalf of owner
     * @dev Only callable by whitelisted contract delegates
     * @param owner The owner to borrow on behalf of
     * @param token The token to borrow
     * @param amount The amount to borrow
     */
    function contractBorrowOnBehalf(
        address owner,
        address token,
        uint256 amount
    ) external nonReentrant {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be > 0");
        
        // Validate contract delegation
        Delegation memory delegation = delegations[owner][msg.sender];
        require(delegation.active, "Delegation not active");
        require(delegation.delegationType == DelegationType.CONTRACT, "Not a contract delegate");
        require(amount <= delegation.maxBorrowAmount, "Amount exceeds delegation cap");
        
        // Ensure caller is actually a contract
        uint256 codeSize;
        assembly { codeSize := extcodesize(caller()) }
        require(codeSize > 0, "Caller is not a contract");
        
        // Execute borrow via lending protocol
        executeBorrow(owner, token, amount);
        
        emit DelegateBorrowExecuted(owner, msg.sender, token, amount);
    }
    
    /**
     * @notice Approve a multisig borrow operation
     * @param owner The owner to borrow on behalf of
     * @param token The token to borrow
     * @param amount The amount to borrow
     * @param expiry The timestamp when the approval expires
     */
    function approveMultisigBorrow(
        address owner,
        address token,
        uint256 amount,
        uint256 expiry
    ) external nonReentrant {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be > 0");
        require(expiry > block.timestamp, "Expired approval");
        
        // Validate delegation
        Delegation memory delegation = delegations[owner][msg.sender];
        require(delegation.active, "Delegation not active");
        require(delegation.delegationType == DelegationType.MULTISIG, "Not a multisig delegate");
        require(amount <= delegation.maxBorrowAmount, "Amount exceeds delegation cap");
        
        // Create operation hash
        bytes32 operationHash = keccak256(abi.encode(
            owner,
            token,
            amount,
            expiry,
            "BORROW" // operation type
        ));
        
        // Ensure operation not already executed
        require(!executedOperations[owner][operationHash], "Operation already executed");
        
        // Record approval if not already approved
        if (!multisigApprovals[owner][operationHash][msg.sender]) {
            multisigApprovals[owner][operationHash][msg.sender] = true;
            multisigApprovalCount[owner][operationHash] += 1;
            
            emit MultisigApproval(owner, msg.sender, operationHash);
        }
        
        // Check if threshold is met and execute if so
        Delegation storage ownerDelegation = delegations[owner][msg.sender];
        if (multisigApprovalCount[owner][operationHash] >= ownerDelegation.threshold) {
            // Verify not expired
            require(block.timestamp <= expiry, "Approval expired");
            
            // Mark as executed to prevent replay
            executedOperations[owner][operationHash] = true;
            
            // Execute borrow
            executeBorrow(owner, token, amount);
            
            emit MultisigBorrowExecuted(owner, operationHash, token, amount);
        }
    }
    
    /**
     * @notice Internal function to execute the borrow
     * @param owner The owner to borrow on behalf of
     * @param token The token to borrow
     * @param amount The amount to borrow
     */
    function executeBorrow(
        address owner,
        address token,
        uint256 amount
    ) internal {
        // Call borrowBehalf on the lending protocol
        lendingProtocol.borrowBehalf(owner, token, amount);
    }
    
    /**
     * @notice Get list of delegates for an owner
     * @param owner The owner address
     * @return Array of delegate addresses
     */
    function getDelegatesForOwner(address owner) external view returns (address[] memory) {
        uint256 length = ownerDelegates[owner].length();
        address[] memory delegates = new address[](length);
        
        for (uint256 i = 0; i < length; i++) {
            delegates[i] = ownerDelegates[owner].at(i);
        }
        
        return delegates;
    }
    
    /**
     * @notice Check if a delegate has an active delegation from an owner
     * @param owner The owner address
     * @param delegate The delegate address
     * @return Whether the delegation is active
     */
    function hasActiveDelegation(address owner, address delegate) external view returns (bool) {
        return delegations[owner][delegate].active;
    }
}