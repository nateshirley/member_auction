import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { MemberAuction } from "../target/types/member_auction";
import * as web3 from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

describe("member_auction", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  const program = anchor.workspace.MemberAuction as Program<MemberAuction>;
  anchor.setProvider(provider);
  const creator = provider.wallet;

  let houseAuthority = null;
  let houseAuthorityBump = null;
  let epoch = 9;
  let memberAuction = null;
  let memberAuctionBump = null;

  it("config", async () => {
    // Add your test here.
    let [_house, _houseBump] = await PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode("house_auth")],
      program.programId
    );
    houseAuthority = _house;
    houseAuthorityBump = _houseBump;
    let [_mA, _mBump] = await getMemberAuctionAddress(epoch);
    memberAuction = _mA;
    memberAuctionBump = _mBump;

    console.log(houseAuthority.toBase58());
  });

  it("initialize house", async () => {
    // Add your test here.
    const tx = await program.rpc.initializeAuctionHouse(houseAuthorityBump, {
      accounts: {
        initializer: creator.publicKey,
        houseAuthority: houseAuthority,
        systemProgram: web3.SystemProgram.programId,
      },
    });
    console.log("Your transaction signature", tx);
  });

  it("create member auction", async () => {
    // Add your test here.
    const tx = await program.rpc.createMemberAuction(memberAuctionBump, epoch, {
      accounts: {
        creator: creator.publicKey,
        memberAuction: memberAuction,
        clock: web3.SYSVAR_CLOCK_PUBKEY,
        systemProgram: web3.SystemProgram.programId,
      },
    });
    console.log("Your transaction signature", tx);
  });

  it("place a bid", async () => {
    let preBid = await provider.connection.getBalance(creator.publicKey);
    console.log("preBid: ", preBid);

    let amount = 1 * web3.LAMPORTS_PER_SOL;
    let amountBN = new BN(amount);
    const tx = await program.rpc.placeBid(amountBN, {
      accounts: {
        bidder: creator.publicKey,
        memberAuction: memberAuction,
        houseAuthority: houseAuthority,
        systemProgram: web3.SystemProgram.programId,
      },
    });

    await program.rpc.placeBid(new BN(2 * web3.LAMPORTS_PER_SOL), {
      accounts: {
        bidder: creator.publicKey,
        memberAuction: memberAuction,
        houseAuthority: houseAuthority,
        systemProgram: web3.SystemProgram.programId,
      },
    });

    await program.rpc.placeBid(new BN(0.5 * web3.LAMPORTS_PER_SOL), {
      accounts: {
        bidder: creator.publicKey,
        memberAuction: memberAuction,
        houseAuthority: houseAuthority,
        systemProgram: web3.SystemProgram.programId,
      },
    });

    await program.rpc.placeBid(new BN(0.5 * web3.LAMPORTS_PER_SOL), {
      accounts: {
        bidder: creator.publicKey,
        memberAuction: memberAuction,
        houseAuthority: houseAuthority,
        systemProgram: web3.SystemProgram.programId,
      },
    });

    let postBid = await provider.connection.getBalance(creator.publicKey);
    console.log("postBid: ", postBid);

    let bids = await program.account.memberAuction.fetch(memberAuction);
    console.log(bids);
  });

  const getMemberAuctionAddress = async (epoch: number) => {
    let toArrayLike = new Int32Array([epoch]).buffer;
    let epochArray = new Uint8Array(toArrayLike);
    return await PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode("member_auction"), epochArray], //
      program.programId
    );
  };
});
