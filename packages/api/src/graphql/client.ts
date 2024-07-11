import { ApolloClient, InMemoryCache } from '@apollo/client';
import config from '../helper/config.js';

const client = new ApolloClient({
  uri: config.aasUri,
  cache: new InMemoryCache(),
});

export default client;
