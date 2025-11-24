use anyhow::Result;
use alkanes_cli_common::{
    alkanes::types::{EnhancedExecuteParams, ProtostoneSpec},
    provider::ConcreteProvider,
    traits::{AlkanesProvider, BitcoinRpcProvider},
};
use alkanes_support::{cellpack::Cellpack, id::AlkaneId};
use clap::Parser;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    #[arg(long)]
    private_key: String,
}

struct Deployer {
    provider: ConcreteProvider,
}

impl Deployer {
    async fn new(args: &Args) -> Result<Self> {
        let mut provider = ConcreteProvider::new(
            Some("http://localhost:18443".to_string()),
            "http://localhost:18888".to_string(),
            None,
            None,
            Some("http://localhost:50010".to_string()),
            "regtest".to_string(),
            None,
        )
        .await?;
        provider.load_external_key_from_hex(&args.private_key)?;
        Ok(Self { provider })
    }

    async fn deploy(&mut self) -> Result<()> {
        println!("Deploying contracts...");
        let cellpack = Cellpack {
            target: AlkaneId { block: 1, tx: 0 },
            inputs: vec![oyldb_str_to_u128("oyldb")?],
        };

        let protostone_spec = ProtostoneSpec {
            cellpack: Some(cellpack),
            edicts: vec![],
            bitcoin_transfer: None,
            pointer: None,
            refund: None,
        };

        let params = EnhancedExecuteParams {
            protostones: vec![protostone_spec],
            to_addresses: vec![],
            from_addresses: None,
            change_address: None,
            input_requirements: vec![],
            envelope_data: None,
            raw_output: false,
            trace_enabled: false,
            mine_enabled: true,
            auto_confirm: true,
            fee_rate: Some(1.0),
        };
        let result = self.provider.execute(params).await?;
        println!("Deployment result: {:?}", result);
        Ok(())
    }
}

fn oyldb_str_to_u128(s: &str) -> Result<u128> {
    let mut bytes = [0u8; 16];
    let s_bytes = s.as_bytes();
    if s_bytes.len() > 16 {
        return Err(anyhow::anyhow!("String is too long to fit in u128"));
    }
    bytes[..s_bytes.len()].copy_from_slice(s_bytes);
    Ok(u128::from_le_bytes(bytes))
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let mut deployer = Deployer::new(&args).await?;
    deployer.deploy().await?;
    println!("Deployment complete!");
    Ok(())
}
