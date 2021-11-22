use anchor_lang::{prelude::*, solana_program};

#[derive(Clone, Copy, AnchorDeserialize, AnchorSerialize)]
pub struct Bid {
    pub bidder: Pubkey,
    pub amount: u64,
}
impl Default for Bid {
    fn default() -> Bid {
        let pubkey_array: [u8; 32] = [
            63, 210, 92, 153, 250, 67, 161, 53, 119, 54, 132, 46, 148, 29, 250, 164, 245, 66, 75,
            90, 243, 255, 180, 97, 99, 141, 22, 29, 130, 10, 177, 119,
        ];
        Bid {
            bidder: Pubkey::new_from_array(pubkey_array),
            amount: 0,
        }
    }
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
