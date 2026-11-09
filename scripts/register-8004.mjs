// Register the gateway as an ERC-8004 agent on Celo mainnet, from its own wallet, tagged.
import { encodeFunctionData, decodeEventLog, parseAbi } from 'viem';
import { loadAccount, sendTagged } from '../src/chain.mjs';

const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const abi = parseAbi([
  'function register(string agentURI) returns (uint256)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
]);
const agentURI = process.env.AGENT_URI || 'https://raw.githubusercontent.com/Nuru-AI/corridor402/main/agent.json';

const account = loadAccount();
const receipt = await sendTagged(account, {
  to: IDENTITY_REGISTRY,
  data: encodeFunctionData({ abi, functionName: 'register', args: [agentURI] }),
});
let agentId = null;
for (const log of receipt.logs) {
  try {
    const ev = decodeEventLog({ abi, data: log.data, topics: log.topics });
    if (ev.eventName === 'Registered') agentId = ev.args.agentId;
  } catch { /* other event */ }
}
console.log(JSON.stringify({
  tx: receipt.transactionHash,
  agentId: agentId?.toString(),
  owner: account.address,
  agentURI,
  scan: agentId ? `https://8004scan.io/agents/celo/${agentId}` : null,
}, null, 2));
