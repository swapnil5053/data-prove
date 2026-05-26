use anchor_lang::prelude::*;

declare_id!("RProv1111111111111111111111111111111111111");

#[program]
pub mod research_provenance {
    use super::*;

    /// Register a new dataset on-chain
    pub fn register_dataset(
        ctx: Context<RegisterDataset>,
        dataset_id: String,
        name: String,
        description: String,
        file_hash: String,
        ipfs_cid: String,
        metadata_uri: String,
    ) -> Result<()> {
        let dataset = &mut ctx.accounts.dataset_record;
        let clock = Clock::get()?;

        require!(dataset_id.len() <= 64, ProvenanceError::IdTooLong);
        require!(name.len() <= 128, ProvenanceError::NameTooLong);
        require!(file_hash.len() == 64, ProvenanceError::InvalidHash);

        dataset.authority = ctx.accounts.authority.key();
        dataset.dataset_id = dataset_id;
        dataset.name = name;
        dataset.description = description;
        dataset.current_hash = file_hash;
        dataset.version_count = 1;
        dataset.created_at = clock.unix_timestamp;
        dataset.updated_at = clock.unix_timestamp;
        dataset.ipfs_cid = ipfs_cid;
        dataset.metadata_uri = metadata_uri;
        dataset.is_active = true;

        msg!("Dataset registered: {}", dataset.name);
        Ok(())
    }

    /// Update a dataset — creates a new version record
    pub fn update_dataset(
        ctx: Context<UpdateDataset>,
        dataset_id: String,
        version_number: u32,
        new_file_hash: String,
        change_description: String,
        ipfs_cid: String,
    ) -> Result<()> {
        let dataset = &mut ctx.accounts.dataset_record;
        let version = &mut ctx.accounts.version_record;
        let clock = Clock::get()?;

        require!(new_file_hash.len() == 64, ProvenanceError::InvalidHash);
        require!(
            ctx.accounts.authority.key() == dataset.authority,
            ProvenanceError::Unauthorized
        );
        require!(
            version_number == dataset.version_count + 1,
            ProvenanceError::InvalidVersionNumber
        );

        // Store previous hash in version record
        version.dataset_id = dataset_id;
        version.version_number = version_number;
        version.previous_hash = dataset.current_hash.clone();
        version.file_hash = new_file_hash.clone();
        version.change_description = change_description;
        version.updated_by = ctx.accounts.authority.key();
        version.timestamp = clock.unix_timestamp;
        version.ipfs_cid = ipfs_cid;

        // Update dataset record
        dataset.current_hash = new_file_hash;
        dataset.version_count = version_number;
        dataset.updated_at = clock.unix_timestamp;

        msg!("Dataset updated to version {}", version_number);
        Ok(())
    }

    /// Transfer dataset ownership to another researcher
    pub fn transfer_ownership(
        ctx: Context<TransferOwnership>,
        _dataset_id: String,
        new_authority: Pubkey,
    ) -> Result<()> {
        let dataset = &mut ctx.accounts.dataset_record;

        require!(
            ctx.accounts.authority.key() == dataset.authority,
            ProvenanceError::Unauthorized
        );

        dataset.authority = new_authority;
        msg!("Ownership transferred to {}", new_authority);
        Ok(())
    }

    /// Deactivate a dataset
    pub fn deactivate_dataset(
        ctx: Context<DeactivateDataset>,
        _dataset_id: String,
    ) -> Result<()> {
        let dataset = &mut ctx.accounts.dataset_record;

        require!(
            ctx.accounts.authority.key() == dataset.authority,
            ProvenanceError::Unauthorized
        );

        dataset.is_active = false;
        msg!("Dataset deactivated");
        Ok(())
    }
}

// ─── Accounts ───────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(dataset_id: String)]
pub struct RegisterDataset<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + DatasetRecord::INIT_SPACE,
        seeds = [b"dataset", dataset_id.as_bytes(), authority.key().as_ref()],
        bump
    )]
    pub dataset_record: Account<'info, DatasetRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(dataset_id: String, version_number: u32)]
pub struct UpdateDataset<'info> {
    #[account(
        mut,
        seeds = [b"dataset", dataset_id.as_bytes(), authority.key().as_ref()],
        bump
    )]
    pub dataset_record: Account<'info, DatasetRecord>,
    #[account(
        init,
        payer = authority,
        space = 8 + VersionRecord::INIT_SPACE,
        seeds = [b"version", dataset_id.as_bytes(), &version_number.to_le_bytes()],
        bump
    )]
    pub version_record: Account<'info, VersionRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(dataset_id: String)]
pub struct TransferOwnership<'info> {
    #[account(
        mut,
        seeds = [b"dataset", dataset_id.as_bytes(), authority.key().as_ref()],
        bump
    )]
    pub dataset_record: Account<'info, DatasetRecord>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(dataset_id: String)]
pub struct DeactivateDataset<'info> {
    #[account(
        mut,
        seeds = [b"dataset", dataset_id.as_bytes(), authority.key().as_ref()],
        bump
    )]
    pub dataset_record: Account<'info, DatasetRecord>,
    pub authority: Signer<'info>,
}

// ─── State ──────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct DatasetRecord {
    pub authority: Pubkey,
    #[max_len(64)]
    pub dataset_id: String,
    #[max_len(128)]
    pub name: String,
    #[max_len(512)]
    pub description: String,
    #[max_len(64)]
    pub current_hash: String,
    pub version_count: u32,
    pub created_at: i64,
    pub updated_at: i64,
    #[max_len(128)]
    pub ipfs_cid: String,
    #[max_len(256)]
    pub metadata_uri: String,
    pub is_active: bool,
}

#[account]
#[derive(InitSpace)]
pub struct VersionRecord {
    #[max_len(64)]
    pub dataset_id: String,
    pub version_number: u32,
    #[max_len(64)]
    pub previous_hash: String,
    #[max_len(64)]
    pub file_hash: String,
    #[max_len(512)]
    pub change_description: String,
    pub updated_by: Pubkey,
    pub timestamp: i64,
    #[max_len(128)]
    pub ipfs_cid: String,
}

// ─── Errors ─────────────────────────────────────────────────

#[error_code]
pub enum ProvenanceError {
    #[msg("Dataset ID too long (max 64 chars)")]
    IdTooLong,
    #[msg("Name too long (max 128 chars)")]
    NameTooLong,
    #[msg("Invalid SHA-256 hash (must be 64 hex chars)")]
    InvalidHash,
    #[msg("Unauthorized: only dataset owner can perform this action")]
    Unauthorized,
    #[msg("Invalid version number: must be sequential")]
    InvalidVersionNumber,
}
