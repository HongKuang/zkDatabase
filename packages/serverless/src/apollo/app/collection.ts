import Joi from 'joi';
import GraphQLJSON from 'graphql-type-json';
import { ModelDatabase } from '@zkdb/storage';
import {
  databaseName,
  collectionName,
  permissionDetail,
  groupName,
  groupDescription
} from './common';
import { TDatabaseRequest } from './database';
import resolverWrapper from '../validation';
import { PermissionsData } from '../types/permission';
import { SchemaData } from '../types/schema';
import { createCollection } from '../../domain/use-case/collection';
import { O1JS_VALID_TYPE } from '../../common/const';

export const schemaField = Joi.object({
  name: Joi.string()
    .pattern(/^[a-z][a-zA-Z0-9_]+$/)
    .required(),
  kind: Joi.string()
    .valid(...O1JS_VALID_TYPE)
    .required(),
  indexed: Joi.boolean(),
})

export const schemaFields = Joi.array().items(schemaField);

export type TCollectionRequest = TDatabaseRequest & {
  collectionName: string;
};

export type TCollectionCreateRequest = TCollectionRequest & {
  groupName: string,
  groupDescription: string,
  schema: SchemaData;
  permissions: PermissionsData;
};

export const CollectionRequest = Joi.object<TCollectionRequest>({
  collectionName,
  databaseName,
});

export const CollectionCreateRequest = Joi.object<TCollectionCreateRequest>({
  collectionName,
  databaseName,
  groupName,
  groupDescription,
  schema: schemaFields,
  permissions: permissionDetail,
});

export const typeDefsCollection = `#graphql
scalar JSON
type Query
type Mutation

input SchemaFieldInput {
  name: String!
  kind: String!
  indexed: Boolean
}

input PermissionRecordInput {
  system: Boolean
  create: Boolean
  read: Boolean
  write: Boolean
  delete: Boolean
}

input PermissionDetailInput {
  permissionOwner: PermissionRecordInput
  permissionGroup: PermissionRecordInput
  permissionOthers: PermissionRecordInput
}

extend type Query {
  collectionList(databaseName: String!): JSON
}

extend type Mutation {
  collectionCreate(
    databaseName: String!, 
    collectionName: String!,
    groupName: String!,
    groupDescription: String,
    schema: [SchemaFieldInput!]!, 
    permissions: PermissionDetailInput
  ): Boolean
}
`;

// Query
const collectionList = resolverWrapper(
  Joi.object({
    databaseName,
  }),
  async (_root: unknown, args: TDatabaseRequest) =>
    ModelDatabase.getInstance(args.databaseName).listCollections()
);

// Mutation
const collectionCreate = resolverWrapper(
  CollectionCreateRequest,
  async (_root: unknown, args: TCollectionCreateRequest) => {
    return createCollection(
      args.databaseName,
      args.collectionName,
      'actor',
      args.groupName,
      args.schema,
      args.permissions
    );
  }
);

export const resolversCollection = {
  JSON: GraphQLJSON,
  Query: {
    collectionList,
  },
  Mutation: {
    collectionCreate,
  },
};
