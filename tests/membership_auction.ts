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
  let auctionAddresses: PublicKey[] = [];
  let auctionBumps: number[] = [];
  let hasClaimedAddresses: PublicKey[] = [];
  let hasClaimedBumps: number[] = [];
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

    for (let i = 0; i < 4; i++) {
      let [_mA, _mBump] = await getMembershipAuctionAddress(epoch, i);
      auctionAddresses[i] = _mA;
      auctionBumps[i] = _mBump;
      let [_has, _hasBump] = await getHasClaimedAddress(epoch, i);
      hasClaimedAddresses[i] = _has;
      hasClaimedBumps[i] = _hasBump;
    }

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
    let index = 0;
    const tx = await program.rpc.createMembershipAuction(
      auctionBumps[index],
      hasClaimedBumps[index],
      epoch,
      index,
      {
        accounts: {
          creator: creator.publicKey,
          membershipAuction: auctionAddresses[index],
          hasClaimed: hasClaimedAddresses[index],
          clock: web3.SYSVAR_CLOCK_PUBKEY,
          systemProgram: web3.SystemProgram.programId,
        },
        instructions: createAuctionInstructions(1, 3),
      }
    );
    //console.log("Your transaction signature", tx);
    let hasC = await program.account.hasClaimed.fetch(hasClaimedAddresses[0]);
    console.log(hasC);
  });

  const createAuctionInstructions = (
    startingIndex: number,
    endIndex: number
  ) => {
    let instructions: anchor.web3.TransactionInstruction[] = [];
    for (let i = startingIndex; i <= endIndex; i++) {
      instructions.push(
        program.instruction.createMembershipAuction(
          auctionBumps[i],
          hasClaimedBumps[i],
          epoch,
          i,
          {
            accounts: {
              creator: creator.publicKey,
              membershipAuction: auctionAddresses[i],
              hasClaimed: hasClaimedAddresses[i],
              clock: web3.SYSVAR_CLOCK_PUBKEY,
              systemProgram: web3.SystemProgram.programId,
            },
          }
        )
      );
    }
    return instructions;
  };

  // const caIx = (i: number) => {

  // }

  it("place a bid", async () => {
    let preBid = await provider.connection.getBalance(creator.publicKey);
    //console.log("preBid: ", preBid);

    await placeBid(2, 0);
    await placeBid(2, 1);
    await placeBid(2, 2);
    await placeBid(2, 3);

    let houseBalance = await provider.connection.getBalance(houseAuthority);
    console.log("house: ", houseBalance);

    let bids = await program.account.membershipAuction.fetch(
      auctionAddresses[1]
    );
    let storedBids: any = bids.bids;
    // storedBids.map((bid) => {
    //   let bidder: PublicKey = bid.bidder;
    //   console.log("bidder: ", bidder.toBase58());
    //   console.log("amount: ", bid.amount.toNumber());
    // });
  });

  const placeBid = async (sol: number, index: number) => {
    await program.rpc.placeBid(
      houseAuthorityBump,
      new BN(sol * web3.LAMPORTS_PER_SOL),
      {
        accounts: {
          bidder: bidder.publicKey,
          newestLoser: await getLosingBidder(auctionAddresses[index]),
          membershipAuction: auctionAddresses[index],
          houseAuthority: houseAuthority,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [bidder],
      }
    );
  };

  it("claim memberhsip from auction", async () => {
    const tx = await program.rpc.claimMembershipFromAuction({
      accounts: {
        claimant: bidder.publicKey,
        membershipAuction: auctionAddresses[0],
        hasClaimed: hasClaimedAddresses[0],
      },
      signers: [bidder],
    });

    let results = await program.account.hasClaimed.fetch(
      hasClaimedAddresses[0]
    );
    console.log(results);
  });
  /*
   */

  const getMembershipAuctionAddress = async (epoch: number, index: number) => {
    let toEpochArrayLike = new Int32Array([epoch]).buffer;
    let epochArray = new Uint8Array(toEpochArrayLike);
    let indexArray = new Uint8Array([index]);
    return await PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode("mship_axn"), epochArray, indexArray], //
      program.programId
    );
  };
  const getHasClaimedAddress = async (epoch: number, index: number) => {
    let toEpochArrayLike = new Int32Array([epoch]).buffer;
    let epochArray = new Uint8Array(toEpochArrayLike);
    let indexArray = new Uint8Array([index]);
    return await PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode("has_claimed"), epochArray, indexArray], //
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

/*
it("settle auction", async () => {
    const tx = await program.rpc.settleMembershipAuction(winnersBump, epoch, {
      accounts: {
        settler: creator.publicKey,
        membershipAuction: auctionAddresses[0],
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
*/

// await program.rpc.placeBid(
//   houseAuthorityBump,
//   epoch,
//   new BN(1.8 * web3.LAMPORTS_PER_SOL),
//   {
//     accounts: {
//       bidder: otherBidder.publicKey,
//       newestLoser: await getLosingBidder(membershipAuction),
//       membershipAuction: membershipAuction,
//       houseAuthority: houseAuthority,
//       systemProgram: web3.SystemProgram.programId,
//     },
//     signers: [otherBidder],
//   }
// );

// await program.rpc.placeBid(
//   houseAuthorityBump,
//   epoch,
//   new BN(1 * web3.LAMPORTS_PER_SOL),
//   {
//     accounts: {
//       bidder: bidder.publicKey,
//       newestLoser: await getLosingBidder(membershipAuction),
//       membershipAuction: membershipAuction,
//       houseAuthority: houseAuthority,
//       systemProgram: web3.SystemProgram.programId,
//     },
//     signers: [bidder],
//   }
// );

// await program.rpc.placeBid(
//   houseAuthorityBump,
//   epoch,
//   new BN(1.5 * web3.LAMPORTS_PER_SOL),
//   {
//     accounts: {
//       bidder: otherBidder.publicKey,
//       newestLoser: await getLosingBidder(membershipAuction),
//       membershipAuction: membershipAuction,
//       houseAuthority: houseAuthority,
//       systemProgram: web3.SystemProgram.programId,
//     },
//     signers: [otherBidder],
//   }
// );
