/**
 * Copyright 2013-2015, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelaySubscription
 * @typechecks
 * @flow
 */

'use strict';

import type {ConcreteFragment} from 'ConcreteQuery';
import type {RelayConcreteNode} from 'RelayQL';
const RelayFragmentReference = require('RelayFragmentReference');
import type RelayMetaRoute from 'RelayMetaRoute';
const RelayStore = require('RelayStore');
import type {
  RelayMutationConfig,
  Variables,
} from 'RelayTypes';

const buildRQL = require('buildRQL');
import type {RelayQLFragmentBuilder} from 'buildRQL';
const forEachObject = require('forEachObject');
const fromGraphQL = require('fromGraphQL');
const invariant = require('invariant');
const warning = require('warning');

export type FileMap = {[key: string]: File};
export type RelayMutationFragments<Tk> = {
  [key: Tk]: RelayQLFragmentBuilder;
};

/**
 * @public
 *
 * RelaySubscription is the base class for modeling subscriptions to events.
 */
class RelaySubscription<Tp: Object> {
  static name: $FlowIssue;
  /* $FlowIssue(>=0.20.0) #9410317 */
  static fragments: RelayMutationFragments<$Keys<Tp>>;
  static initialVariables: Variables;
  static prepareVariables: ?(
    prevVariables: Variables,
    route: RelayMetaRoute
  ) => Variables;

  props: Tp;
  _didShowFakeDataWarning: boolean;

  constructor(props: Tp) {
    this._didShowFakeDataWarning = false;
    this._resolveProps(props);
  }

  /**
   * Each subscription has a server name which is used by clients to communicate the
   * type of subscription that should be executed on the server.
   */
  getSubscription(): RelayConcreteNode {
    invariant(
      false,
      '%s: Expected abstract method `getSubscription` to be implemented.',
      this.constructor.name
    );
  }

  /**
   * These configurations are used to generate the query for the subscription to be
   * sent to the server and to correctly write the server's response into the
   * client store.
   *
   * Possible configuration types:
   *
   * -  RANGE_ADD provides configuration for adding a new edge to a range.
   *    {
   *      type: RelayMutationType.RANGE_ADD;
   *      parentName: string;
   *      parentID: string;
   *      connectionName: string;
   *      edgeName: string;
   *      rangeBehaviors:
   *        {[call: string]: GraphQLMutatorConstants.RANGE_OPERATIONS};
   *    }
   *    where `parentName` is the field in the query that contains the range,
   *    `parentID` is the DataID of `parentName` in the store, `connectionName`
   *    is the name of the range, `edgeName` is the name of the key in server
   *    response that contains the newly created edge, `rangeBehaviors` maps
   *    stringified representation of calls on the connection to
   *    GraphQLMutatorConstants.RANGE_OPERATIONS.
   *
   * -  NODE_DELETE provides configuration for deleting a node and the
   *    corresponding edge from a range.
   *    {
   *      type: RelayMutationType.NODE_DELETE;
   *      parentName: string;
   *      parentID: string;
   *      connectionName: string;
   *      deletedIDFieldName: string;
   *    }
   *    where `parentName`, `parentID` and `connectionName` refer to the same
   *    things as in RANGE_ADD, `deletedIDFieldName` is the name of the key in
   *    the server response that contains the DataID of the deleted node.
   *
   * -  RANGE_DELETE provides configuration for deleting an edge from a range
   *    but doesn't delete the node.
   *    {
   *      type: RelayMutationType.RANGE_DELETE;
   *      parentName: string;
   *      parentID: string;
   *      connectionName: string;
   *      deletedIDFieldName: string;
   *      pathToConnection: Array<string>;
   *    }
   *    where `parentName`, `parentID`, `connectionName` and
   *    `deletedIDFieldName` refer to the same things as in NODE_DELETE,
   *    `pathToConnection` provides a path from `parentName` to
   *    `connectionName`.
   *
   */
  getConfigs(): Array<RelayMutationConfig> {
    invariant(
      false,
      '%s: Expected abstract method `getConfigs` to be implemented.',
      this.constructor.name
    );
  }

  /**
   * These variables form the "input" to the subscription query sent to the server.
   */
  getVariables(): {[name: string]: mixed} {
    invariant(
      false,
      '%s: Expected abstract method `getVariables` to be implemented.',
      this.constructor.name
    );
  }

  _resolveProps(props: Tp): void {
    const fragments = this.constructor.fragments;
    const initialVariables = this.constructor.initialVariables || {};

    const resolvedProps = {...props};
    forEachObject(fragments, (fragmentBuilder, fragmentName) => {
      var propValue = props[fragmentName];
      warning(
        propValue !== undefined,
        'RelaySubscription: Expected data for fragment `%s` to be supplied to ' +
        '`%s` as a prop. Pass an explicit `null` if this is intentional.',
        fragmentName,
        this.constructor.name
      );

      if (!propValue) {
        return;
      }

      var fragment = fromGraphQL.Fragment(buildSubscriptionFragment(
        this.constructor.name,
        fragmentName,
        fragmentBuilder,
        initialVariables
      ));
      var fragmentHash = fragment.getConcreteNodeHash();

      if (fragment.isPlural()) {
        invariant(
          Array.isArray(propValue),
          'RelaySubscription: Invalid prop `%s` supplied to `%s`, expected an ' +
          'array of records because the corresponding fragment is plural.',
          fragmentName,
          this.constructor.name
        );
        var dataIDs = propValue.reduce((acc, item, ii) => {
          var eachFragmentPointer = item[fragmentHash];
          invariant(
            eachFragmentPointer,
            'RelaySubscription: Invalid prop `%s` supplied to `%s`, ' +
            'expected element at index %s to have query data.',
            fragmentName,
            this.constructor.name,
            ii
          );
          return acc.concat(eachFragmentPointer.getDataIDs());
        }, []);

        resolvedProps[fragmentName] = RelayStore.readAll(fragment, dataIDs);
      } else {
        invariant(
          !Array.isArray(propValue),
          'RelaySubscription: Invalid prop `%s` supplied to `%s`, expected a ' +
          'single record because the corresponding fragment is not plural.',
          fragmentName,
          this.constructor.name
        );
        var fragmentPointer = propValue[fragmentHash];
        if (fragmentPointer) {
          var dataID = fragmentPointer.getDataID();
          resolvedProps[fragmentName] = RelayStore.read(fragment, dataID);
        } else {
          if (__DEV__) {
            if (!this._didShowFakeDataWarning) {
              this._didShowFakeDataWarning = true;
              warning(
                false,
                'RelaySubscription: Expected prop `%s` supplied to `%s` to ' +
                'be data fetched by Relay. This is likely an error unless ' +
                'you are purposely passing in mock data that conforms to ' +
                'the shape of this subscription\'s fragment.',
                fragmentName,
                this.constructor.name
              );
            }
          }
        }
      }
    });
    this.props = resolvedProps;
  }

  static getFragment(
    fragmentName: $Keys<Tp>,
    variableMapping?: Variables
  ): RelayFragmentReference {
    // TODO: Unify fragment API for containers and mutations, #7860172.
    var fragments = this.fragments;
    var fragmentBuilder = fragments[fragmentName];
    if (!fragmentBuilder) {
      invariant(
        false,
        '%s.getFragment(): `%s` is not a valid fragment name. Available ' +
        'fragments names: %s',
        this.name,
        fragmentName,
        Object.keys(fragments).map(name => '`' + name + '`').join(', ')
      );
    }

    const initialVariables = this.initialVariables || {};
    var prepareVariables = this.prepareVariables;

    return RelayFragmentReference.createForContainer(
      () => buildSubscriptionFragment(
        this.name,
        fragmentName,
        fragmentBuilder,
        initialVariables
      ),
      initialVariables,
      variableMapping,
      prepareVariables
    );
  }
}

/**
 * Wrapper around `buildRQL.Fragment` with contextual error messages.
 */
function buildSubscriptionFragment(
  subscriptionName: string,
  fragmentName: string,
  fragmentBuilder: RelayQLFragmentBuilder,
  variables: Variables
): ConcreteFragment {
  var fragment = buildRQL.Fragment(
    fragmentBuilder,
    variables
  );
  invariant(
    fragment,
    'Relay.QL defined on subscription `%s` named `%s` is not a valid fragment. ' +
    'A typical fragment is defined using: Relay.QL`fragment on Type {...}`',
    subscriptionName,
    fragmentName
  );
  return fragment;
}

module.exports = RelaySubscription;
