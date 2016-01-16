/**
 * Copyright 2013-2015, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule buildSubscriptionQuery
 * @typechecks
 * @flow
 */

'use strict';

import type {ConcreteSubscription} from 'ConcreteQuery';
import type {
  RelayMutationConfig,
  Variables,
} from 'RelayTypes';

const RelayConnectionInterface = require('RelayConnectionInterface');
const RelayNodeInterface = require('RelayNodeInterface');
const RelayMetaRoute = require('RelayMetaRoute');
const RelayMutationType = require('RelayMutationType');
const RelayQuery = require('RelayQuery');

const invariant = require('invariant');
const warning = require('warning');

const {CLIENT_SUBSCRIPTION_ID} = RelayConnectionInterface;
const {TYPENAME} = RelayNodeInterface;

/**
 * `buildSubscriptionQuery` takes an AST node for a subscription and
 * creates a RelayQuery.Subscription.  The majority of the work is handled by
 * `RelayQuery.Subscription#create` with a few fields appended to the query
 * due to the `RelayMutationConfig`.  This logic may not be required and instead
 * the user could be given warnings / errors to correct their subscription query
 * to match their configuration.
 */
function buildSubscriptionQuery(
  node: ConcreteSubscription,
  input: Variables,
  configs: Array<RelayMutationConfig>): RelayQuery.Subscription {

  let query = RelayQuery.Subscription.create(
    node,
    RelayMetaRoute.get('$RelaySubscriptionObserver'),
    {input}
  );

  // append `CLIENT_SUBSCRIPTION_ID` to the payload no matter what
  // I'm still not certain why this is required but `Relay.QL` requires it as
  // an input to the subscription field so might as well make sure its in the
  // payload.
  let nextChildren = query.getChildren().concat(
    RelayQuery.Field.build({
      fieldName: CLIENT_SUBSCRIPTION_ID,
      type: 'String',
      metadata: {isRequisite:true},
    })
  );

  // can't use a reduce for some reason, flow is unhappy
  configs.forEach(config => {
    switch (config.type) {
      case RelayMutationType.RANGE_ADD:
        nextChildren = updateEdgeFieldForInsertion(nextChildren, config);
        break;

      case RelayMutationType.RANGE_DELETE:
      case RelayMutationType.NODE_DELETE:
        nextChildren = nextChildren.concat(RelayQuery.Field.build({
          fieldName: config.deletedIDFieldName,
          type: 'String',
        }));
        break;

      case RelayMutationType.REQUIRED_CHILDREN:
        warning(
          false,
          '`REQUIRED_CHILDREN` is not applicable to subscriptions, place ' +
          'any required children in the subscription query itself.'
        );
        break;
      case RelayMutationType.FIELDS_CHANGE:
        warning(
          false,
          '`FIELDS_CHANGE` is not applicable to subscriptions, any ' +
          'fields present in the subscription query will be changed.'
        );
        break;
    }
  });

  query = query.clone(nextChildren);

  invariant(
    query instanceof RelayQuery.Subscription,
    'RelaySubscriptionObserver: Expected a subscription.'
  );

  return query;
}

/*
 * For mutation configs of `RANGE_ADD` we need to insert the `__typename` field
 * on the edge to be added, configured via `edgeName`.  If this is not done
 * the query writer emits warnings it does not know the type of the edge.
 */
function updateEdgeFieldForInsertion(children, config) {
  let hasEdgeField = false;

  // we need to walk fragments in case the `edge` is not a direct child.
  // this may be unnecessary and instead we just warn the user to put it in
  // the direct selection set.
  //
  // e.g.
  //
  // subscription {
  //   addTodoSubscribe { ... on AddTodoSubscribePayload { todoEdge } }
  // }
  //
  // vs.
  //
  // subscription {
  //   addTodoSubscribe { todoEdge }
  // }
  //
  const nextChildren = children.map(child => mapFields(child, field => {
    if (field.getSchemaName() === config.edgeName) {
      hasEdgeField = true;
      return addField(field, RelayQuery.Field.build({
        fieldName: TYPENAME,
        type: 'String',
      }));
    } else {
      return field;
    }
  }));

  invariant(
    hasEdgeField,
    'RelaySubscription: query does not contain edge `%s`.',
    config.edgeName
  );

  return nextChildren;
}

function addField(
  parent: RelayQuery.Field,
  child: RelayQuery.Field): RelayQuery.Field {

  const newField = parent.clone(parent.getChildren().concat(child));
  invariant(
    newField instanceof RelayQuery.Field,
    'buildSubscriptionQuery: Expected a field.'
  );
  return newField;
}

/**
 * maps a function against a node's child fields, including fields in child
 * fragments
 */
function mapFields(
  node: RelayQuery.Node,
  fn: (value: RelayQuery.Field) => RelayQuery.Field
): RelayQuery.Node {
  if (node instanceof RelayQuery.Field) {
    return fn(node);
  } else if (node instanceof RelayQuery.Fragment) {
    // TODO: can avoid the clone if no child changes
    const newFragment = node.clone(node.getChildren().map(child => mapFields(child, fn)));
    invariant(
      newFragment instanceof RelayQuery.Fragment,
      'buildSubscriptionQuery: Expected a fragment.'
    );
    return newFragment;
  } else {
    invariant(
      false,
      'buildSubscriptionQuery: Expected a field or a fragment.'
    );
  }
}

module.exports = buildSubscriptionQuery;
