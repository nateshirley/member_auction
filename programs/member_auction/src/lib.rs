use anchor_lang::{prelude::*, solana_program};
use std::{cmp::Reverse, convert::TryFrom};
declare_id!("ESTKKn8WMNMPqp9cbLGH86GwFqEnPgHVc9MyZwKGo5Wh");

const HOUSE_SEED: &[u8] = b"house_auth";
const MEMBER_AUCTION_SEED: &[u8] = b"member_auction";
const NUM_BIDS: usize = 4;

#[program]
pub mod member_auction {
    use super::*;

    //need to organize auction accounts
    /*
    1. create auction
    2. place bid
    3. finalize auction
    4. claim winnings
    */

    pub fn initialize_auction_house(
        ctx: Context<InitializeAuctionHouse>,
        house_authority_bump: u8,
    ) -> ProgramResult {
        ctx.accounts.house_authority.bump = house_authority_bump;
        //maybe more here not sure
        Ok(())
    }

    pub fn create_member_auction(
        ctx: Context<CreateMemberAuction>,
        member_auction_bump: u8,
        epoch: u32,
    ) -> ProgramResult {
        //obvi need more checks around when it can start
        //also consider writing custom code for auction house to pay? idk

        ctx.accounts.member_auction.bump = member_auction_bump;
        ctx.accounts.member_auction.epoch = epoch;
        ctx.accounts.member_auction.start_timestamp =
            u64::try_from(ctx.accounts.clock.unix_timestamp).unwrap();
        Ok(())
    }

    //lol i need to work on the leaderboard, this is much cleaner.
    pub fn place_bid(ctx: Context<PlaceBid>, amount: u64) -> ProgramResult {
        //storing bids in descending order so i can pop the lowests value
        //biggest value at zero

        verify_bid_amount(amount, &ctx.accounts.member_auction)?;
        let mut open_bids = ctx.accounts.member_auction.bids.to_vec();
        let new_bid = Bid {
            bidder: ctx.accounts.bidder.key(),
            amount: amount,
        };
        match open_bids.binary_search_by(|probe| probe.cmp(&new_bid).reverse()) {
            Ok(pos) => {
                //someone submits a bid that is equal to an existing bid, but higher than the minimum
                //search returns matching position. if multiple matches, any one of them can be returned
                //im just gonna put it at -1 so most it could be is "in front" of another equal, but likely "behind"
                if pos < open_bids.len() {
                    open_bids.insert(pos + 1, new_bid);
                    ctx.accounts.member_auction.bids = new_bids_arr_from_vec(open_bids);
                }
            }
            Err(pos) => {
                if pos < open_bids.len() {
                    open_bids.insert(pos, new_bid);
                    ctx.accounts.member_auction.bids = new_bids_arr_from_vec(open_bids);
                }
            }
        }
        // msg!("insert at position {}", pos);
        // panic!();

        solana_program::program::invoke(
            &solana_program::system_instruction::transfer(
                ctx.accounts.bidder.key,
                &ctx.accounts.house_authority.key(),
                amount,
            ),
            &[
                ctx.accounts.bidder.to_account_info(),
                ctx.accounts.house_authority.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        Ok(())
    }
}

fn new_bids_arr_from_vec(mut open_bids: Vec<Bid>) -> [Bid; NUM_BIDS] {
    open_bids.pop();
    let mut new_bids = [Bid::default(); NUM_BIDS];
    for i in (0..NUM_BIDS).rev() {
        new_bids[i] = open_bids.pop().unwrap();
    }
    return new_bids;
}

fn verify_bid_amount(amount: u64, member_auction: &Account<MemberAuction>) -> ProgramResult {
    const MIN_INCREMENT_PERCENTAGE: u64 = 2;
    let lowest_bid_index = member_auction.bids.len() - 1;
    let lowest_bid = if member_auction.bids[lowest_bid_index].amount > 0 {
        member_auction.bids[lowest_bid_index].amount
    } else {
        100
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
#[instruction(house_bump: u8)]
pub struct InitializeAuctionHouse<'info> {
    #[account(mut)]
    initializer: Signer<'info>,
    #[account(
        init,
        seeds = [HOUSE_SEED],
        bump = house_bump,
        payer = initializer,
    )]
    house_authority: Account<'info, HouseAuthority>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(member_auction_bump: u8, epoch: u32)]
pub struct CreateMemberAuction<'info> {
    creator: Signer<'info>,
    #[account(
        init,
        seeds = [MEMBER_AUCTION_SEED, &epoch.to_le_bytes()],
        bump = member_auction_bump,
        payer = creator
    )]
    member_auction: Account<'info, MemberAuction>,
    clock: Sysvar<'info, Clock>,
    system_program: Program<'info, System>,
}

//add check to verify member auction time
#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    bidder: Signer<'info>,
    #[account(mut)]
    member_auction: Account<'info, MemberAuction>,
    #[account(mut)]
    house_authority: Account<'info, HouseAuthority>,
    system_program: Program<'info, System>,
}

#[account]
#[derive(Default)]
pub struct HouseAuthority {
    bump: u8,
}

#[account]
#[derive(Default)]
pub struct MemberAuction {
    epoch: u32,
    start_timestamp: u64,
    bids: [Bid; 4],
    bump: u8,
}

#[derive(Default, Clone, Copy, AnchorDeserialize, AnchorSerialize)]
pub struct Bid {
    bidder: Pubkey,
    amount: u64,
}

impl std::cmp::Ord for Bid {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.amount.cmp(&other.amount)
    }
}
impl std::cmp::PartialOrd for Bid {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
impl std::cmp::PartialEq for Bid {
    fn eq(&self, other: &Self) -> bool {
        self.amount == other.amount
    }
}
impl std::cmp::Eq for Bid {}
/*

 //oh yeah it wants this to be signer. fuck it
    #[account(
        mut,
        seeds = [HOUSE_SEED],
        bump = house_authority.bump,
    )]
    house_authority: Account<'info, HouseAuthority>,
*/

#[error]
pub enum ErrorCode {
    #[msg("bid does not meet minimum for this auction (lowest * 1.02)")]
    LowBallBid,
}
