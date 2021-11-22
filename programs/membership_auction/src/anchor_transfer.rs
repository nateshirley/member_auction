use anchor_lang::{prelude::*, solana_program};

#[derive(Accounts)]
pub struct TransferLamports<'info> {
    pub from: AccountInfo<'info>,
    pub to: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

pub fn transfer_from_signer<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, TransferLamports<'info>>,
    amount: u64,
) -> ProgramResult {
    solana_program::program::invoke(
        &solana_program::system_instruction::transfer(
            ctx.accounts.from.key,
            ctx.accounts.to.key,
            amount,
        ),
        &[
            ctx.accounts.from,
            ctx.accounts.to,
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;
    Ok(())
}
pub fn transfer_from_pda<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, TransferLamports<'info>>,
    amount: u64,
) -> ProgramResult {
    solana_program::program::invoke_signed(
        &solana_program::system_instruction::transfer(
            ctx.accounts.from.key,
            ctx.accounts.to.key,
            amount,
        ),
        &[
            ctx.accounts.from,
            ctx.accounts.to,
            ctx.accounts.system_program.to_account_info(),
        ],
        ctx.signer_seeds,
    )?;
    Ok(())
}
