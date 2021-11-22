import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { MembershipAuction } from "../target/types/membership_auction";
import * as web3 from "@solana/web3.js";
import { PublicKey, Keypair } from "@solana/web3.js";
import BN from "bn.js";

describe("membership_auction", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  const program = anchor.workspace
    .MembershipAuction as Program<MembershipAuction>;
  anchor.setProvider(provider);
  const creator = provider.wallet;

  let houseAuthority = null;
  let houseAuthorityBump = null;
  let epoch = 9;
  let membershipAuction = null;
  let membershipAuctionBump = null;
  let bidder = Keypair.generate();
  let otherBidder = Keypair.generate();
  let winners = null;
  let winnersBump = null;

  it("config", async () => {
    // Add your test here.
    let [_house, _houseBump] = await PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode("house_auth")],
      program.programId
    );
    //setting my wallet as default bidder so loser pass is safe
    // let arr = creator.publicKey.toBuffer();
    // let eight = new Uint8Array(arr);
    // console.log(eight);
    // console.log("ARRRR: ", arr);
    houseAuthority = _house;
    houseAuthorityBump = _houseBump;
    let [_mA, _mBump] = await getMembershipAuctionAddress(epoch);
    membershipAuction = _mA;
    membershipAuctionBump = _mBump;

    await provider.connection.requestAirdrop(
      bidder.publicKey,
      web3.LAMPORTS_PER_SOL * 8
    );
    await provider.connection.requestAirdrop(
      otherBidder.publicKey,
      web3.LAMPORTS_PER_SOL * 8
    );
    let [_winners, _winnersBump] = await getMembershipWinnersAddress(epoch);
    winners = _winners;
    winnersBump = _winnersBump;

    console.log(houseAuthority.toBase58());
  });

  it("create membership auction", async () => {
    // Add your test here.
    const tx = await program.rpc.createMembershipAuction(
      membershipAuctionBump,
      epoch,
      {
        accounts: {
          creator: creator.publicKey,
          membershipAuction: membershipAuction,
          clock: web3.SYSVAR_CLOCK_PUBKEY,
          systemProgram: web3.SystemProgram.programId,
        },
      }
    );
    console.log("Your transaction signature", tx);
  });

  it("place a bid", async () => {
    let preBid = await provider.connection.getBalance(creator.publicKey);
    //console.log("preBid: ", preBid);

    let amount = 1 * web3.LAMPORTS_PER_SOL;
    let amountBN = new BN(amount);

    const tx = await program.rpc.placeBid(houseAuthorityBump, epoch, amountBN, {
      accounts: {
        bidder: bidder.publicKey,
        newestLoser: await getLosingBidder(membershipAuction),
        membershipAuction: membershipAuction,
        houseAuthority: houseAuthority,
        systemProgram: web3.SystemProgram.programId,
      },
      signers: [bidder],
    });

    await program.rpc.placeBid(
      houseAuthorityBump,
      epoch,
      new BN(2 * web3.LAMPORTS_PER_SOL),
      {
        accounts: {
          bidder: bidder.publicKey,
          newestLoser: await getLosingBidder(membershipAuction),
          membershipAuction: membershipAuction,
          houseAuthority: houseAuthority,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [bidder],
      }
    );

    await program.rpc.placeBid(
      houseAuthorityBump,
      epoch,
      new BN(0.5 * web3.LAMPORTS_PER_SOL),
      {
        accounts: {
          bidder: bidder.publicKey,
          newestLoser: await getLosingBidder(membershipAuction),
          membershipAuction: membershipAuction,
          houseAuthority: houseAuthority,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [bidder],
      }
    );

    await program.rpc.placeBid(
      houseAuthorityBump,
      epoch,
      new BN(1.8 * web3.LAMPORTS_PER_SOL),
      {
        accounts: {
          bidder: otherBidder.publicKey,
          newestLoser: await getLosingBidder(membershipAuction),
          membershipAuction: membershipAuction,
          houseAuthority: houseAuthority,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [otherBidder],
      }
    );

    await program.rpc.placeBid(
      houseAuthorityBump,
      epoch,
      new BN(1 * web3.LAMPORTS_PER_SOL),
      {
        accounts: {
          bidder: bidder.publicKey,
          newestLoser: await getLosingBidder(membershipAuction),
          membershipAuction: membershipAuction,
          houseAuthority: houseAuthority,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [bidder],
      }
    );

    await program.rpc.placeBid(
      houseAuthorityBump,
      epoch,
      new BN(1.5 * web3.LAMPORTS_PER_SOL),
      {
        accounts: {
          bidder: otherBidder.publicKey,
          newestLoser: await getLosingBidder(membershipAuction),
          membershipAuction: membershipAuction,
          houseAuthority: houseAuthority,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [otherBidder],
      }
    );

    let balance = await provider.connection.getBalance(bidder.publicKey);
    console.log(balance);

    let postBid = await provider.connection.getBalance(creator.publicKey);
    //console.log("postBid: ", postBid);

    let bids = await program.account.membershipAuction.fetch(membershipAuction);
    let storedBids: any = bids.bids;
    storedBids.map((bid) => {
      let bidder: PublicKey = bid.bidder;
      console.log("bidder: ", bidder.toBase58());
      console.log("amount: ", bid.amount.toNumber());
    });
  });

  it("settle auction", async () => {
    const tx = await program.rpc.settleMembershipAuction(winnersBump, epoch, {
      accounts: {
        settler: creator.publicKey,
        membershipAuction: membershipAuction,
        winners: winners,
        systemProgram: web3.SystemProgram.programId,
      },
    });

    let results = await program.account.membershipAuctionWinners.fetch(winners);
    let record: any = results.record;
    record.map((recordedWinner) => {
      let winner: PublicKey = recordedWinner.wallet;
      console.log("bidder: ", winner.toBase58());
      console.log("hasclaimed: ", recordedWinner.hasClaimed);
    });
  });

  it("claim memberhsip from auction", async () => {
    const tx = await program.rpc.claimMembershipFromAuction({
      accounts: {
        claimant: otherBidder.publicKey,
        winners: winners,
      },
      signers: [otherBidder],
    });

    let results = await program.account.membershipAuctionWinners.fetch(winners);
    let record: any = results.record;
    record.map((recordedWinner) => {
      let winner: PublicKey = recordedWinner.wallet;
      console.log("bidder: ", winner.toBase58());
      console.log("hasclaimed: ", recordedWinner.hasClaimed);
    });
  });

  const getMembershipAuctionAddress = async (epoch: number) => {
    let toArrayLike = new Int32Array([epoch]).buffer;
    let epochArray = new Uint8Array(toArrayLike);
    return await PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode("mship_axn"), epochArray], //
      program.programId
    );
  };
  const getLosingBidder = async (membershipAuctionAddress: PublicKey) => {
    let membershipAuction: any = await program.account.membershipAuction.fetch(
      membershipAuctionAddress
    );
    let length = membershipAuction.bids.length;
    let loser: PublicKey = membershipAuction.bids[length - 1].bidder;
    return loser;
  };
  const getMembershipWinnersAddress = async (epoch: number) => {
    let toArrayLike = new Int32Array([epoch]).buffer;
    let epochArray = new Uint8Array(toArrayLike);
    return await PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode("winners"), epochArray], //
      program.programId
    );
  };
});
