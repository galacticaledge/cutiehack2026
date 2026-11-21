//! One-time LEARN token setup on Solana devnet (SPEC §12).
//!   cargo run --bin setup_token               create the mint, mint 1 LEARN to the authority
//!   cargo run --bin setup_token -- --keygen   print a fresh MINT_AUTHORITY_SECRET to paste into .env
use socra::solana::keypair_from_json;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::signature::{Keypair, Signer};
use solana_sdk::transaction::Transaction;
use spl_associated_token_account::get_associated_token_address;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;
use spl_token::solana_program::program_pack::Pack;

fn env(k: &str) -> Option<String> {
    std::env::var(k).ok().filter(|v| !v.trim().is_empty())
}

/// Write MINT_ADDRESS into the nearest .env file (if found).
fn write_env_mint(addr: &str) -> Option<std::path::PathBuf> {
    let path = dotenvy::dotenv().ok()?;
    let text = std::fs::read_to_string(&path).ok()?;
    let mut found = false;
    let mut lines: Vec<String> = text
        .lines()
        .map(|l| {
            if l.starts_with("MINT_ADDRESS=") {
                found = true;
                format!("MINT_ADDRESS={addr}")
            } else {
                l.to_string()
            }
        })
        .collect();
    if !found {
        lines.push(format!("MINT_ADDRESS={addr}"));
    }
    std::fs::write(&path, lines.join("\n") + "\n").ok()?;
    Some(path)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    if std::env::args().any(|a| a == "--keygen") {
        let kp = Keypair::new();
        println!("Public key: {}", kp.pubkey());
        println!(
            "MINT_AUTHORITY_SECRET={}",
            serde_json::to_string(&kp.to_bytes().to_vec())?
        );
        return Ok(());
    }
    let secret = env("MINT_AUTHORITY_SECRET").ok_or_else(|| {
        anyhow::anyhow!("Set MINT_AUTHORITY_SECRET in .env (or run with --keygen)")
    })?;
    let payer = keypair_from_json(&secret)?;
    let decimals: u8 = env("TOKEN_DECIMALS")
        .and_then(|d| d.parse().ok())
        .unwrap_or(2);
    let rpc = RpcClient::new_with_commitment(
        env("SOLANA_RPC_URL").unwrap_or_else(|| "https://api.devnet.solana.com".into()),
        CommitmentConfig::confirmed(),
    );

    println!("Mint authority: {}", payer.pubkey());
    let sol = rpc.get_balance(&payer.pubkey()).await? as f64 / 1e9;
    println!("SOL balance:    {sol}");
    if sol < 1.0 {
        println!(
            "⚠  Under 1 SOL. Fund it at https://faucet.solana.com (devnet) with address {}",
            payer.pubkey()
        );
    }
    if sol < 0.01 {
        anyhow::bail!("Not enough SOL to create the mint. Fund the authority first.");
    }

    let mint = Keypair::new();
    let rent = rpc
        .get_minimum_balance_for_rent_exemption(spl_token::state::Mint::LEN)
        .await?;
    #[allow(deprecated)]
    let create = solana_sdk::system_instruction::create_account(
        &payer.pubkey(),
        &mint.pubkey(),
        rent,
        spl_token::state::Mint::LEN as u64,
        &spl_token::id(),
    );
    let init = spl_token::instruction::initialize_mint2(
        &spl_token::id(),
        &mint.pubkey(),
        &payer.pubkey(),
        None,
        decimals,
    )?;
    let bh = rpc.get_latest_blockhash().await?;
    let tx = Transaction::new_signed_with_payer(
        &[create, init],
        Some(&payer.pubkey()),
        &[&payer, &mint],
        bh,
    );
    let sig = rpc.send_and_confirm_transaction(&tx).await?;
    println!("Created LEARN mint: https://explorer.solana.com/tx/{sig}?cluster=devnet");
    println!("\nMINT_ADDRESS={}\n", mint.pubkey());

    // Mint 1 LEARN to the authority as a smoke test.
    let ata = get_associated_token_address(&payer.pubkey(), &mint.pubkey());
    let ixs = [
        create_associated_token_account_idempotent(
            &payer.pubkey(),
            &payer.pubkey(),
            &mint.pubkey(),
            &spl_token::id(),
        ),
        spl_token::instruction::mint_to(
            &spl_token::id(),
            &mint.pubkey(),
            &ata,
            &payer.pubkey(),
            &[],
            10u64.pow(decimals as u32),
        )?,
    ];
    let bh = rpc.get_latest_blockhash().await?;
    let tx = Transaction::new_signed_with_payer(&ixs, Some(&payer.pubkey()), &[&payer], bh);
    let sig = rpc.send_and_confirm_transaction(&tx).await?;
    println!(
        "Minted 1 LEARN to the authority: https://explorer.solana.com/tx/{sig}?cluster=devnet"
    );

    match write_env_mint(&mint.pubkey().to_string()) {
        Some(p) => println!(
            "Wrote MINT_ADDRESS to {}. Restart the server to enable payouts.",
            p.display()
        ),
        None => println!("Add MINT_ADDRESS to your .env and restart the server."),
    }
    Ok(())
}
