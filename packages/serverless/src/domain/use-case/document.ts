import { ModelSequencer } from '@zkdb/storage';
import { PermissionBinary, partialToPermission } from '../../common/permission';
import ModelDocument, { DocumentRecord } from '../../model/abstract/document';
import { Document } from '../types/document';
import { Permissions } from '../types/permission';
import {
  checkDocumentPermission,
  checkCollectionPermission,
} from './permission';
import { proveCreateDocument, proveDeleteDocument } from './prover';
import ModelDocumentMetadata from '../../model/database/document-metadata';
import {
  ZKDATABASE_GROUP_SYSTEM,
  ZKDATABASE_USER_SYSTEM,
} from '../../common/const';
import { getCurrentTime } from '../../helper/common';
import { ModelCollectionMetadata } from '../../model/database/collection-metadata';

export interface FilterCriteria {
  [key: string]: any;
}

async function readDocument(
  databaseName: string,
  collectionName: string,
  actor: string,
  filter: FilterCriteria
): Promise<Document | null> {
  if (
    !(await checkCollectionPermission(
      databaseName,
      collectionName,
      actor,
      'read'
    ))
  ) {
    throw new Error(
      `Access denied: Actor '${actor}' does not have 'read' permission for collection '${collectionName}'.`
    );
  }

  const modelDocument = ModelDocument.getInstance(databaseName, collectionName);

  const documentRecord = await modelDocument.findOne(filter);

  if (!documentRecord) {
    throw new Error('Document not found.');
  }

  const hasReadPermission = await checkDocumentPermission(
    databaseName,
    collectionName,
    actor,
    documentRecord._id,
    'read'
  );

  if (!hasReadPermission) {
    throw new Error(
      `Access denied: Actor '${actor}' does not have 'read' permission for the specified document.`
    );
  }

  const document: Document = Object.keys(documentRecord).map((key) => ({
    name: documentRecord[key].name,
    kind: documentRecord[key].kind,
    value: documentRecord[key].value,
  }));

  return document;
}

async function createDocument(
  databaseName: string,
  collectionName: string,
  actor: string,
  document: Document,
  permissions: Permissions
) {
  if (
    !(await checkCollectionPermission(
      databaseName,
      collectionName,
      actor,
      'create'
    ))
  ) {
    throw new Error(
      `Access denied: Actor '${actor}' does not have 'create' permission for collection '${collectionName}'.`
    );
  }

  const modelDocument = ModelDocument.getInstance(databaseName, collectionName);

  const documentRecord: DocumentRecord = {};

  document.forEach((field) => {
    documentRecord[field.name] = {
      name: field.name,
      kind: field.kind,
      value: field.value,
    };
  });

  const documentPermissionOwner = PermissionBinary.toBinaryPermission(
    partialToPermission(permissions.permissionOwner)
  );
  const documentPermissionGroup = PermissionBinary.toBinaryPermission(
    partialToPermission(permissions.permissionGroup)
  );
  const documentPermissionOther = PermissionBinary.toBinaryPermission(
    partialToPermission(permissions.permissionOther)
  );

  // 1. Save document
  const insertResult = await modelDocument.insertDocument(documentRecord);

  // 2. Create new sequence value
  const sequencer = ModelSequencer.getInstance(databaseName);
  const merkleIndex = await sequencer.getNextValue('merkle-index');

  // 3. Create Metadata
  const modelDocumentMetadata = new ModelDocumentMetadata(databaseName);

  const modelSchema = ModelCollectionMetadata.getInstance(databaseName);

  const documentSchema = await modelSchema.getMetadata(collectionName);

  const { permissionOwner, permissionGroup, permissionOther } = documentSchema;

  await modelDocumentMetadata.insertOne({
    collection: collectionName,
    docId: insertResult.insertedId,
    merkleIndex,
    ...{
      permissionOwner,
      permissionGroup,
      permissionOther,
      // I'm set these to system user and group as default
      // In case this permission don't override by the user
      // this will prevent the user from accessing the data
      group: ZKDATABASE_GROUP_SYSTEM,
      owner: ZKDATABASE_USER_SYSTEM,
    },
    // Overwrite inherited permission with the new one
    permissionOwner: documentPermissionOwner,
    permissionGroup: documentPermissionGroup,
    permissionOther: documentPermissionOther,
    createdAt: getCurrentTime(),
    updatedAt: getCurrentTime(),
  });

  // 4. Prove document creation
  const witness = await proveCreateDocument(
    databaseName,
    collectionName,
    insertResult.insertedId,
    document
  );

  return witness;
}

async function updateDocument(
  databaseName: string,
  collectionName: string,
  actor: string,
  filter: FilterCriteria,
  update: Document
) {
  if (
    !(await checkCollectionPermission(
      databaseName,
      collectionName,
      actor,
      'write'
    ))
  ) {
    throw new Error(
      `Access denied: Actor '${actor}' does not have 'write' permission for collection '${collectionName}'.`
    );
  }

  const modelDocument = ModelDocument.getInstance(databaseName, collectionName);

  const documentRecord: DocumentRecord = {};

  update.forEach((field) => {
    documentRecord[field.name] = {
      name: field.name,
      kind: field.kind,
      value: field.value,
    };
  });

  const updateResult = await modelDocument.collection.updateMany(filter, {
    $set: documentRecord,
  });

  // We need to do this to make sure that only 1 record
  if (
    (updateResult.modifiedCount !== 1 && updateResult.matchedCount !== 1) ||
    !updateResult
  ) {
    throw new Error('Invalid update, modified count not equal to 1');
  }

  const oldDocumentRecord = await modelDocument.findOne(filter);

  if (
    !(await checkDocumentPermission(
      databaseName,
      collectionName,
      actor,
      oldDocumentRecord!._id,
      'write'
    ))
  ) {
    throw new Error(
      `Access denied: Actor '${actor}' does not have 'write' permission for the specified document.`
    );
  }

  await modelDocument.updateDocument(filter, documentRecord);
}

async function deleteDocument(
  databaseName: string,
  collectionName: string,
  actor: string,
  filter: FilterCriteria
) {
  if (
    !(await checkCollectionPermission(
      databaseName,
      collectionName,
      actor,
      'delete'
    ))
  ) {
    throw new Error(
      `Access denied: Actor '${actor}' does not have 'delete' permission for collection '${collectionName}'.`
    );
  }

  const modelDocument = ModelDocument.getInstance(databaseName, collectionName);

  const document = await modelDocument.findOne(filter);

  if (!document) {
    throw Error('Document does not exist');
  }

  if (
    !(await checkDocumentPermission(
      databaseName,
      collectionName,
      actor,
      document._id,
      'delete'
    ))
  ) {
    throw new Error(
      `Access denied: Actor '${actor}' does not have 'delete' permission for the specified document.`
    );
  }

  const witness = await proveDeleteDocument(
    databaseName,
    collectionName,
    document._id
  );

  await modelDocument.drop({ _id: document._id });

  const modelDocumentMetadata = new ModelDocumentMetadata(databaseName);

  await modelDocumentMetadata.deleteOne({ docId: document._id });

  return witness;
}

export { readDocument, createDocument, updateDocument, deleteDocument };
