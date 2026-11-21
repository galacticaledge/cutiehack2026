import { getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

let conn: Connection | null = null;

export function connection(): Connection {
  conn ??= new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
  return conn;
}

export function decimals(): number {
  return Number(process.env.TOKEN_DECIMALS ?? 2);
}

export function toBaseUnits(learn: number): number {
  return Math.round(learn * 10 ** decimals());
}

export function fromBaseUnits(base: number): number {
  return base / 10 ** decimals();
}

export function solanaConfigured(): boolean {
  return Boolean(process.env.MINT_AUTHORITY_SECRET && process.env.MINT_ADDRESS);
}

export function payer(): Keypair {
  const raw = process.env.MINT_AUTHORITY_SECRET;
  if (!raw) throw new Error("MINT_AUTHORITY_SECRET is not set");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

export function mintAddress(): PublicKey {
  if (!process.env.MINT_ADDRESS) throw new Error("MINT_ADDRESS is not set (run scripts/setup-token.ts)");
  return new PublicKey(process.env.MINT_ADDRESS);
}

export function generateUserWallet(): { pubkey: string; secret: string } {
  const kp = Keypair.generate();
  return { pubkey: kp.publicKey.toBase58(), secret: bs58.encode(kp.secretKey) };
}

/** Mint LEARN to a user's wallet. Payer covers ATA rent. Returns the tx signature. */
export async function mintReward(toPubkey: string, amountBase: number): Promise<string> {
  const c = connection();
  const p = payer();
  const mint = mintAddress();
  const ata = await getOrCreateAssociatedTokenAccount(c, p, mint, new PublicKey(toPubkey), false, "confirmed");
  return mintTo(c, p, mint, ata.address, p, amountBase, [], { commitment: "confirmed" });
}

/** LEARN balance (whole tokens) read from chain. Returns null if unavailable. */
export async function getTokenBalance(pubkey: string): Promise<number | null> {
  if (!process.env.MINT_ADDRESS) return null;
  try {
    const ata = getAssociatedTokenAddressSync(mintAddress(), new PublicKey(pubkey));
    const bal = await Promise.race([
      connection().getTokenAccountBalance(ata, "confirmed"),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("rpc timeout")), 5000)),
    ]);
    return Number(bal.value.uiAmount ?? 0);
  } catch (e) {
    const msg = String((e as Error)?.message ?? "");
    if (/could not find account|Invalid param/i.test(msg)) return 0;
    return null;
  }
}

export const explorerTxUrl = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddressUrl = (addr: string) => `https://explorer.solana.com/address/${addr}?cluster=devnet`;
