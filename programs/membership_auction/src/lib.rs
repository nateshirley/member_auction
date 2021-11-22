use anchor_lang::{prelude::*, solana_program};
use std::{cmp::Reverse, convert::TryFrom};
declare_id!("6Zt81sekecE5npwcDSLveAH1Uvs75DfXqaquLbXdPpD1");

const HOUSE_SEED: &[u8] = b"house_auth";
const MEMBERSHIP_AUCTION_SEED: &[u8] = b"mship_axn";
const WINNERS_SEED: &[u8] = b"winners";
const NUM_BIDS: usize = 4;
const MINIMUM_OPENING_BID: u64 = 100;

mod anchor_transfer;
mod bid;
use bid::Bid;

#[program]
pub mod membership_auction {
    use super::*;

    //need to organize auction accounts
    /*
    1. create auction
    2. place bid
    3. finalize auction
    4. claim winnings
    */

    pub fn create_membership_auction(
        ctx: Context<CreateMembershipAuction>,
        membership_auction_bump: u8,
        epoch: u32,
    ) -> ProgramResult {
        //obvi need more checks around when it can start

        ctx.accounts.membership_auction.bump = membership_auction_bump;
        ctx.accounts.membership_auction.epoch = epoch;
        ctx.accounts.membership_auction.start_timestamp =
            u64::try_from(ctx.accounts.clock.unix_timestamp).unwrap();

        ctx.accounts.membership_auction.bids = [Bid::default(); 4];
        Ok(())
    }

    //lol i need to work on the leaderboard, this is much cleaner.
    pub fn place_bid(
        ctx: Context<PlaceBid>,
        house_authority_bump: u8,
        _epoch: u32,
        amount: u64,
    ) -> ProgramResult {
        //storing bids in descending order so i can always pop the lowest value off the end
        //ie biggest value at zero

        verify_bid_amount(amount, &ctx.accounts.membership_auction)?;
        //tranfer lamps from bidder to the house
        anchor_transfer::transfer_from_signer(ctx.accounts.into_receive_bid_context(), amount)?;

        let mut open_bids = ctx.accounts.membership_auction.bids.to_vec();
        let new_bid = Bid {
            bidder: ctx.accounts.bidder.key(),
            amount: amount,
        };
        //turn it back on later
        //verify_unique_bidder(ctx.accounts.bidder.key, &open_bids)?;
        match open_bids.binary_search_by(|probe| probe.cmp(&new_bid).reverse()) {
            Ok(pos) => {
                //someone submits a bid that is equal to an existing bid, but higher than the minimum
                //search returns matching position. if multiple matches, any one of them can be returned
                //im just gonna put it at -1 so most it could be is "in front" of another equal, but likely "behind"
                if pos < open_bids.len() {
                    open_bids.insert(pos + 1, new_bid);
                    return_lamps_to_newest_loser(
                        &ctx,
                        open_bids.pop().unwrap(),
                        house_authority_bump,
                    )?;
                    ctx.accounts.membership_auction.bids = new_bids_arr_from_vec(open_bids);
                }
            }
            Err(pos) => {
                if pos < open_bids.len() {
                    open_bids.insert(pos, new_bid);
                    return_lamps_to_newest_loser(
                        &ctx,
                        open_bids.pop().unwrap(),
                        house_authority_bump,
                    )?;
                    ctx.accounts.membership_auction.bids = new_bids_arr_from_vec(open_bids);
                }
            }
        }
        Ok(())
    }

    pub fn settle_membership_auction(
        ctx: Context<SettleMembershipAuction>,
        _winners_bump: u8,
        _epoch: u32,
    ) -> ProgramResult {
        //validate the time
        //declare the winners

        for (i, winning_bid) in ctx.accounts.membership_auction.bids.iter().enumerate() {
            ctx.accounts.winners.record[i] = MembershipAuctionWinner {
                wallet: winning_bid.bidder,
                has_claimed: false,
            };
        }
        Ok(())
    }

    pub fn claim_membership_from_auction(
        ctx: Context<ClaimMembershipFromAuction>,
    ) -> ProgramResult {
        for winner in ctx.accounts.winners.record.iter_mut() {
            if winner.wallet.eq(ctx.accounts.claimant.key) && !winner.has_claimed {
                winner.has_claimed = true;
                return Ok(());
                //mint the new membership
            }
        }
        Err(ErrorCode::NoAuctionClaimAuthority.into())
    }
}

impl<'info> PlaceBid<'info> {
    fn into_receive_bid_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, anchor_transfer::TransferLamports<'info>> {
        let cpi_program = self.system_program.to_account_info();
        let cpi_accounts = anchor_transfer::TransferLamports {
            from: self.bidder.to_account_info(),
            to: self.house_authority.to_account_info(),
            system_program: self.system_program.clone(),
        };
        CpiContext::new(cpi_program, cpi_accounts)
    }
    fn into_return_lamps_to_loser_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, anchor_transfer::TransferLamports<'info>> {
        let cpi_program = self.system_program.to_account_info();
        let cpi_accounts = anchor_transfer::TransferLamports {
            from: self.house_authority.to_account_info(),
            to: self.newest_loser.to_account_info(),
            system_program: self.system_program.clone(),
        };
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

fn return_lamps_to_newest_loser(
    ctx: &Context<PlaceBid>,
    losing_bid: Bid,
    house_authority_bump: u8,
) -> ProgramResult {
    if losing_bid.amount > MINIMUM_OPENING_BID {
        assert!(losing_bid.bidder.eq(ctx.accounts.newest_loser.key));
        let seeds = &[&HOUSE_SEED[..], &[house_authority_bump]];
        anchor_transfer::transfer_from_pda(
            ctx.accounts
                .into_return_lamps_to_loser_context()
                .with_signer(&[&seeds[..]]),
            losing_bid.amount,
        )?;
    }
    Ok(())
}

fn verify_unique_bidder(new_bidder: &Pubkey, open_bids: &Vec<Bid>) -> ProgramResult {
    for bid in open_bids {
        if bid.bidder.eq(new_bidder) {
            return Err(ErrorCode::NonUniqueBidder.into());
        }
    }
    Ok(())
}
fn new_bids_arr_from_vec(mut open_bids: Vec<Bid>) -> [Bid; NUM_BIDS] {
    let mut new_bids = [Bid::default(); NUM_BIDS];
    for i in (0..NUM_BIDS).rev() {
        new_bids[i] = open_bids.pop().unwrap();
    }
    return new_bids;
}
fn verify_bid_amount(
    amount: u64,
    membership_auction: &Account<MembershipAuction>,
) -> ProgramResult {
    const MIN_INCREMENT_PERCENTAGE: u64 = 2;
    let lowest_bid_index = membership_auction.bids.len() - 1;
    let lowest_bid = if membership_auction.bids[lowest_bid_index].amount > 0 {
        membership_auction.bids[lowest_bid_index].amount
    } else {
        MINIMUM_OPENING_BID
    };
    let min_bid = lowest_bid
        + lowest_bid
            .checked_mul(MIN_INCREMENT_PERCENTAGE)
            .unwrap()
            .checked_div(100)
            .unwrap();
    msg!("lowest_bid: {}, min_bid: {}", lowest_bid, min_bid);
    if amount > min_bid {
        Ok(())
    } else {
        Err(ErrorCode::LowBallBid.into())
    }
}

#[derive(Accounts)]
#[instruction(membership_auction_bump: u8, epoch: u32)]
pub struct CreateMembershipAuction<'info> {
    creator: Signer<'info>,
    #[account(
        init,
        seeds = [MEMBERSHIP_AUCTION_SEED, &epoch.to_le_bytes()],
        bump = membership_auction_bump,
        payer = creator
    )]
    membership_auction: Account<'info, MembershipAuction>,
    clock: Sysvar<'info, Clock>,
    system_program: Program<'info, System>,
}

//add check to verify Membership auction time
#[derive(Accounts)]
#[instruction(house_authority_bump: u8, epoch: u32)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    bidder: Signer<'info>,
    #[account(mut)]
    newest_loser: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [MEMBERSHIP_AUCTION_SEED, &epoch.to_le_bytes()],
        bump = membership_auction.bump,
    )]
    membership_auction: Account<'info, MembershipAuction>,
    #[account(
        mut,
        seeds = [HOUSE_SEED],
        bump = house_authority_bump
    )]
    house_authority: UncheckedAccount<'info>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(winners_bump: u8, epoch: u32)]
pub struct SettleMembershipAuction<'info> {
    settler: Signer<'info>,
    #[account(
        seeds = [MEMBERSHIP_AUCTION_SEED, &epoch.to_le_bytes()],
        bump = membership_auction.bump
    )]
    membership_auction: Account<'info, MembershipAuction>,
    #[account(
        init,
        seeds = [WINNERS_SEED, &epoch.to_le_bytes()],
        bump = winners_bump,
        payer = settler
    )]
    winners: Account<'info, MembershipAuctionWinners>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimMembershipFromAuction<'info> {
    claimant: Signer<'info>,
    //add address verification
    #[account(mut)]
    winners: Account<'info, MembershipAuctionWinners>,
}

#[account]
#[derive(Default)]
pub struct MembershipAuctionWinners {
    record: [MembershipAuctionWinner; 4],
}

#[derive(Default, Clone, Copy, AnchorDeserialize, AnchorSerialize)]
pub struct MembershipAuctionWinner {
    wallet: Pubkey,
    has_claimed: bool,
}

#[account]
#[derive(Default)]
pub struct MembershipAuction {
    epoch: u32,
    start_timestamp: u64,
    bids: [Bid; 4],
    bump: u8,
}

#[error]
pub enum ErrorCode {
    #[msg("bid does not meet minimum for this auction (lowest * 1.02)")]
    LowBallBid,
    #[msg("bidding wallet has already placed a bid on this auction")]
    NonUniqueBidder,
    #[msg("wallet has no authority to claim. either they didn't win or they already claimed")]
    NoAuctionClaimAuthority,
}
