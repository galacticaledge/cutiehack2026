//! LEARN token on Solana devnet: user wallets, minting, balances.
use crate::config::Config;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{Keypair, Signer};
use solana_sdk::transaction::Transaction;
use spl_associated_token_account::get_associated_token_address;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;
use std::str::FromStr;
use std::time::Duration;

pub struct Solana {
    pub rpc: RpcClient,
    pub payer: Keypair,
    pub mint: Pubkey,
}

pub fn keypair_from_json(raw: &str) -> anyhow::Result<Keypair> {
    let bytes: Vec<u8> = serde_json::from_str(raw)?;
    Keypair::try_from(bytes.as_slice()).map_err(|e| anyhow::anyhow!("bad MINT_AUTHORITY_SECRET: {e}"))
}

pub fn rpc_client(cfg: &Config) -> RpcClient {
    RpcClient::new_with_timeout_and_commitment(cfg.solana_rpc_url.clone(), Duration::from_secs(30), CommitmentConfig::confirmed())
}

impl Solana {
    pub fn from_config(cfg: &Config) -> anyhow::Result<Self> {
        let secret = cfg.mint_authority_secret.as_deref().ok_or_else(|| anyhow::anyhow!("MINT_AUTHORITY_SECRET not set"))?;
        let mint = cfg.mint_address.as_deref().ok_or_else(|| anyhow::anyhow!("MINT_ADDRESS not set (run setup_token)"))?;
        Ok(Solana { rpc: rpc_client(cfg), payer: keypair_from_json(secret)?, mint: Pubkey::from_str(mint)? })
    }

    /// Mint LEARN (base units) to a wallet; the payer covers ATA rent. Returns the tx signature.
    pub async fn mint_reward(&self, to: &str, amount_base: u64) -> anyhow::Result<String> {
        let owner = Pubkey::from_str(to)?;
        let ata = get_associated_token_address(&owner, &self.mint);
        let ixs = vec![
            create_associated_token_account_idempotent(&self.payer.pubkey(), &owner, &self.mint, &spl_token::id()),
            spl_token::instruction::mint_to(&spl_token::id(), &self.mint, &ata, &self.payer.pubkey(), &[], amount_base)?,
        ];
        let blockhash = self.rpc.get_latest_blockhash().await?;
        let tx = Transaction::new_signed_with_payer(&ixs, Some(&self.payer.pubkey()), &[&self.payer], blockhash);
        let sig = self.rpc.send_and_confirm_transaction(&tx).await?;
        Ok(sig.to_string())
    }

    /// Mint with one retry (SPEC §12).
    pub async fn mint_with_retry(&self, to: &str, amount_base: u64) -> anyhow::Result<String> {
        match self.mint_reward(to, amount_base).await {
            Ok(s) => Ok(s),
            Err(e) => {
                tracing::warn!("[mint] first attempt failed, retrying: {e}");
                self.mint_reward(to, amount_base).await
            }
        }
    }

    /// Whole-LEARN balance from chain. None if the RPC is unavailable.
    pub async fn token_balance(&self, owner: &str) -> Option<f64> {
        let owner = Pubkey::from_str(owner).ok()?;
        let ata = get_associated_token_address(&owner, &self.mint);
        match tokio::time::timeout(Duration::from_secs(5), self.rpc.get_token_account_balance(&ata)).await {
            Ok(Ok(b)) => Some(b.ui_amount.unwrap_or(0.0)),
            Ok(Err(e)) => {
                let msg = e.to_string();
                if msg.contains("could not find account") || msg.contains("Invalid param") || msg.contains("AccountNotFound") {
                    Some(0.0)
                } else {
                    tracing::warn!("[solana] balance failed: {msg}");
                    None
                }
            }
            Err(_) => None,
        }
    }

    pub async fn sol_balance(&self) -> anyhow::Result<f64> {
        Ok(self.rpc.get_balance(&self.payer.pubkey()).await? as f64 / 1e9)
    }
}

pub fn generate_user_wallet() -> (String, String) {
    let kp = Keypair::new();
    (kp.pubkey().to_string(), bs58::encode(kp.to_bytes()).into_string())
}

pub fn explorer_tx_url(sig: &str) -> String {
    format!("https://explorer.solana.com/tx/{sig}?cluster=devnet")
}

pub fn explorer_address_url(addr: &str) -> String {
    format!("https://explorer.solana.com/address/{addr}?cluster=devnet")
}
