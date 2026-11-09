// Check the ERC-8021 attribution tag on Celo transactions: node scripts/verify-tags.mjs <txHash> [...]
// Prints, per transaction, who sent it and the codes its calldata carries (none = untagged).
import { verifyTx } from '@celo/attribution-tags';
import { publicClient } from '../src/tx.mjs';

export async function tagsOf(hash) {
  const [tx, tag] = await Promise.all([publicClient.getTransaction({ hash }), verifyTx({ client: publicClient, hash }).catch(() => null)]);
  return { tx: hash, from: tx.from, to: tx.to, codes: tag?.codes || [] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const h of process.argv.slice(2)) console.log(JSON.stringify(await tagsOf(h)));
}
