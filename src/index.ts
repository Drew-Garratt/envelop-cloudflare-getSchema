
import 'core-js/web/immediate';
import { envelop, useAsyncSchema, useLogger } from '@envelop/core';
import { getGraphQLParameters, processRequest, Response } from 'graphql-helix';
import { GraphQLSchema } from 'graphql/type';
import { Handler, Router } from 'worktop';
import { listen } from 'worktop/cache';
import { loadSchema } from '@graphql-tools/load'
import { UrlLoader } from '@graphql-tools/url-loader';

const API = new Router();

const getSchema = async (): Promise<GraphQLSchema> => {
  const schema = await loadSchema(`https://${SHOPIFY_STORE}/api/${STOREFRONT_API_VERSION}/graphql.json`, {   // load from endpoint
    loaders: [
      new UrlLoader()
    ],
    headers: {
      "X-Shopify-Storefront-Access-Token": STOREFRONT_API_PASSWORD
    },
  });
  return schema;
};

const getEnveloped = envelop({
  plugins: [
    useAsyncSchema(getSchema()),
    useLogger()
  ],
});

function parseQuery(queryString: string) {
  const query: Record<string, string> = {};
  const pairs = (queryString[0] === "?" ? queryString.substr(1) : queryString).split("&");
  for (let i = 0; i < pairs.length; ++i) {
    const pair = pairs[i].split("=");
    query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || "");
  }
  return query;
}

const graphqlHandler: Handler = async (req, res) => {
  const request = {
    body: req.method === "POST" ? await req.body() : undefined,
    headers: req.headers,
    method: req.method,
    query: req.search ? parseQuery(req.search) : {},
  };

  const { parse, validate, contextFactory, execute, schema } = getEnveloped({ req });

  const { operationName, query, variables } = getGraphQLParameters(request);

  const result = (await processRequest({
    operationName,
    query,
    variables,
    request,
    schema,
    parse,
    validate,
    execute,
    contextFactory,
  })) as Response<any, any>;

  res.send(
    result.status,
    result.payload,
    result.headers.reduce((prev, item) => ({ ...prev, [item.name]: item.value }), {})
  );
}

API.add('GET', '/graphql', graphqlHandler);

API.add('POST', '/graphql', graphqlHandler);

API.add('GET', '/alive', (req, res) => {
  res.end('OK'); // Node.js-like `res.end`
});

listen(API.run);
