import { DatabaseRollUp } from '@proof';
import {
  Bool,
  Field,
  MerkleTree,
  Provable,
  SmartContract,
  State,
  ZkProgram,
  method,
  state,
  Permissions,
  AccountUpdate,
} from 'o1js';

export type ZKDatabaseSmartContractClass = ReturnType<
  typeof getZkDbSmartContractClass
>;

export function getZkDbSmartContractClass(
  merkleHeight: number,
  rollUpProgram: DatabaseRollUp
) {
  const dummyMerkleTree = new MerkleTree(merkleHeight);

  class ZkDbProof extends ZkProgram.Proof(rollUpProgram) {}

  class ZkDbSmartContract extends SmartContract {
    @state(Field) currentState = State<Field>();
    @state(Field) prevState = State<Field>();
    @state(Field) actionState = State<Field>();

    init() {
      super.init();

      this.account.permissions.set({
        ...Permissions.default(),
        setDelegate: Permissions.impossible(),
        setTokenSymbol: Permissions.impossible(),
        setVotingFor: Permissions.impossible(),
        setTiming: Permissions.impossible(),
      });

      this.currentState.set(dummyMerkleTree.getRoot());
      this.prevState.set(Field(0));
    }

    @method async rollUp(proof: ZkDbProof) {
      proof.verify();

      const currentState = this.currentState.getAndRequireEquals();
      const prevState = this.prevState.getAndRequireEquals();

      proof.publicInput.previousOnChainState.assertEquals(prevState);

      proof.publicInput.currentOnChainState.assertEquals(currentState);

      proof.publicInput.currentOnChainState.assertEquals(
        proof.publicOutput.onChainState
      );

      this.prevState.set(currentState);
      this.currentState.set(proof.publicOutput.newOffChainState);

      AccountUpdate.createSigned(this.address);
    }
  }

  return ZkDbSmartContract;
}
