import * as anchor from "@coral-xyz/anchor";
import {Program} from "@coral-xyz/anchor";
import idl from "../target/idl/solquad.json";
import {Solquad} from "../target/types/solquad";

import {utf8} from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import {BN} from "bn.js";

describe("solquad", async () => {
    // const connection = new anchor.web3.Connection(anchor.web3.clusterApiUrl("devnet"), 'confirmed');
    // local connection.
    const connection = new anchor.web3.Connection(anchor.web3.clusterApiUrl("devnet"), 'confirmed');
    // const programId = new anchor.web3.PublicKey("3fowu869PY6frqrYPdhtCzsm7j1jgjpr47HyuyMP9xUH");
    const programId = new anchor.web3.PublicKey("3fowu869PY6frqrYPdhtCzsm7j1jgjpr47HyuyMP9xUH");

    const admin = anchor.web3.Keypair.generate();
    const admin2 = anchor.web3.Keypair.generate();
    const wallet = new anchor.Wallet(admin);
    const wallet2 = new anchor.Wallet(admin2);
    const provider = new anchor.AnchorProvider(connection, wallet, {});
    const provider2 = new anchor.AnchorProvider(connection, wallet2, {});
    const program = new Program<Solquad>(idl as Solquad, programId, provider)
    const program2 = new Program<Solquad>(idl as Solquad, programId, provider2)

    // const escrowOwner = anchor.web3.Keypair.generate();
    // const projectOwner1 = anchor.web3.Keypair.generate();
    // const projectOwner2 = anchor.web3.Keypair.generate();
    // const projectOwner3 = anchor.web3.Keypair.generate();
    // const voter1 = anchor.web3.Keypair.generate();
    // const voter2 = anchor.web3.Keypair.generate();
    // const voter3 = anchor.web3.Keypair.generate();
    // const voter4 = anchor.web3.Keypair.generate();
    // const voter5 = anchor.web3.Keypair.generate();
    // const voter6 = anchor.web3.Keypair.generate();

    let escrowPDA, poolPDA, projectPDA1, differentEscrowPDA, differentPoolPDA;

    before(async () => {
        [escrowPDA] = anchor.web3.PublicKey.findProgramAddressSync([
                utf8.encode("escrow"),
                admin.publicKey.toBuffer(),
            ],
            program.programId
        );

        [poolPDA] = anchor.web3.PublicKey.findProgramAddressSync([
                utf8.encode("pool"),
                admin.publicKey.toBuffer(),
            ],
            program.programId
        );

        [projectPDA1] = anchor.web3.PublicKey.findProgramAddressSync([
                utf8.encode("project"),
                poolPDA.toBytes(),
                admin.publicKey.toBuffer(),
            ],
            program.programId
        );

        [differentEscrowPDA] = anchor.web3.PublicKey.findProgramAddressSync([
                utf8.encode("escrow"),
                admin2.publicKey.toBuffer(),
            ],
            program.programId
        );

        [differentPoolPDA] = anchor.web3.PublicKey.findProgramAddressSync([
                utf8.encode("pool"),
                admin2.publicKey.toBuffer()
            ],
            program.programId
        );

        airdrop(admin, provider);
        airdrop(admin2, provider);

    });

    // Test 1
    it("initializes escrow and pool", async () => {
        // await airdrop(admin, provider);
        // await airdrop(admin2, provider);
        const poolIx = await program.methods.initializePool().accounts({
            poolAccount: poolPDA,
        }).instruction();

        const escrowAndPoolTx = await program.methods.initializeEscrow(new BN(10000)).accounts({
            escrowAccount: escrowPDA,
        })
            .postInstructions([poolIx])
            .rpc()

        console.log("Escrow and Pool are successfully created!", escrowAndPoolTx);

    });

    // Test 2
    it("creates project and add it to the pool twice", async () => {
        try {
            const addProjectIx = await program.methods.addProjectToPool().accounts({
                escrowAccount: escrowPDA,
                poolAccount: poolPDA,
                projectAccount: projectPDA1,
            })
                .instruction();

            const addProjectTx = await program.methods.initializeProject("My Project").accounts({
                projectAccount: projectPDA1,
                poolAccount: poolPDA
            })
                .postInstructions([addProjectIx, addProjectIx])
                .rpc();

            console.log("Project successfully created and added to the pool twice", addProjectTx);

            const data = await program.account.pool.fetch(poolPDA)
            console.log("data projects", data.projects);
        } catch (_err) {
            console.log('Error caught: DuplicateProject');
            expect(_err).to.be.instanceOf(AnchorError);
            const err: AnchorError = _err;
            expect(err.error.errorCode.number).to.equal(6000);
            expect(err.error.errorMessage).to.equal('Duplicate project');
        }
    });

    // Test 3
    it("tries to add the project in the different pool", async () => {
        try {
            const poolIx = await program2.methods.initializePool().accounts({
                poolAccount: differentPoolPDA,
            }).instruction();

            const escrowIx = await program2.methods.initializeEscrow(new BN(10000)).accounts({
                escrowAccount: differentEscrowPDA,
            })
                // .instruction();
                .postInstructions([poolIx])
                .rpc();

            console.log("New Escrow and different Pool are successfully created!", escrowIx);

            const addProjectTx = await program2.methods.addProjectToPool().accounts({
                projectAccount: projectPDA1,
                poolAccount: differentPoolPDA,
                escrowAccount: differentEscrowPDA
            })
                .instruction();

            const initProjectTx = await program2.methods.initializeProject("My Project").accounts({
                projectAccount: projectPDA1,
                poolAccount: differentPoolPDA,
            })
                .postInstructions([addProjectTx])
                .rpc();

            console.log("Project successfully initialized and added for the differentPoolPDA", initProjectTx);

            const data = await program.account.pool.fetch(differentPoolPDA)
            console.log("data projects", data.projects);
        } catch (_err) {
            console.log('Error caught: Seed constraint error');
            expect(_err).to.be.instanceOf(AnchorError);
            const err: AnchorError = _err;
            expect(err.error.errorCode.number).to.equal(2006);
            expect(err.error.errorMessage).to.equal('A seeds constraint was violated');
        }
    });

    // Test 4
    it("votes for the project and distributes the rewards", async () => {
        try {
            await program.methods.initializeProject("My Project").accounts({
                projectAccount: projectPDA1,
                poolAccount: poolPDA
            })
                .postInstructions([])
                .rpc();

            const distribIx = await program.methods.distributeEscrowAmount().accounts({
                escrowAccount: escrowPDA,
                poolAccount: poolPDA,
                projectAccount: projectPDA1,
            })
                .instruction();

            const voteTx = await program.methods.voteForProject(new BN(10)).accounts({
                poolAccount: poolPDA,
                projectAccount: projectPDA1,
            })
                .postInstructions([distribIx])
                .rpc();

            console.log("Successfully voted on the project and distributed weighted rewards", voteTx);

            const ant = await program.account.project.fetch(projectPDA1)
            console.log("amount", ant.distributedAmt.toString());
        } catch (_err) {
            console.log('Error caught: Seed constraint error');
            expect(_err).to.be.instanceOf(AnchorError);
            const err: AnchorError = _err;
            console.log(err.error.errorCode.number);
            console.log(err.error.errorMessage);
        }
    });
});

async function airdrop(user, provider) {
    const AIRDROP_AMOUNT = anchor.web3.LAMPORTS_PER_SOL; // 5 SOL

    // airdrop to user
    const airdropSignature = await provider.connection.requestAirdrop(
        user.publicKey,
        AIRDROP_AMOUNT
    );
    const {blockhash, lastValidBlockHeight} = await provider.connection.getLatestBlockhash();

    await provider.connection.confirmTransaction({
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight,
        signature: airdropSignature,
    });

    console.log(`Tx Complete: https://explorer.solana.com/tx/${airdropSignature}?cluster=Localnet`)
}

