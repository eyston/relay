/**
 * Copyright 2013-2015, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelaySubscriptionObserver
 * @typechecks
 * @flow
 */

'use strict';

import type {ConcreteSubscription} from 'ConcreteQuery';
import type {ClientSubscriptionID} from 'RelayInternalTypes';
import type RelayQuery from 'RelayQuery';
import type RelaySubscription from 'RelaySubscription';
import type RelayStoreData from 'RelayStoreData';
import type {
  RelayMutationConfig,
  Subscription,
  SubscriptionCallbacks,
  SubscriptionResult,
  Variables,
} from 'RelayTypes';

const QueryBuilder = require('QueryBuilder');
const RelayConnectionInterface = require('RelayConnectionInterface');

const base62 = require('base62');
const buildSubscriptionQuery = require('buildSubscriptionQuery');
const invariant = require('invariant');

const {CLIENT_SUBSCRIPTION_ID} = RelayConnectionInterface;


let subscriptionIDCounter = 0;

/**
 * AbstractObserver is a base class which implements the Rx specific parts of
 * the subscription.  It is only used by RelaySubscriptionObserver but is a
 * separate class purely to make it easier to see what logic is abstract
 * Rx behavior and what is speific to implementing Relay subscriptions.
 *
 * In RxJS parlance this is an AutoDetachObserver and SingleAssignmentDisposable.
 * The significance of this is that the subscription is disposed when the
 * observable is complete (onError / onCompleted).
 *
 * For a release this abstract class could merged directly into
 * RelaySubscriptionObserver and not a separate class.
 */
class AbstractObserver {
  _active: boolean;
  _disposed: boolean;
  _disposable: ?Subscription;


  constructor() {
    this._active = true;
    this._disposed = false;
    this._disposable = null;
  }

  next(data) {
    invariant(
      false,
      '%s: Expected abstract method `next` to be implemented.',
      this.constructor.name
    );
  }

  error(error) {
    invariant(
      false,
      '%s: Expected abstract method `error` to be implemented.',
      this.constructor.name
    );
  }

  completed() {
    invariant(
      false,
      '%s: Expected abstract method `completed` to be implemented.',
      this.constructor.name
    );
  }

  onNext(data) {
    if (this._active) {
      try {
        this.next(data);
      } catch (e) {
        // TODO: are these the semantics we want?  A callback error closes the
        // subscription?
        this.dispose();
        throw e;
      }
    }
  }

  onError(error) {
    if (this._active) {
      this._active = false;
      try {
        this.error(error);
      } finally {
        this.dispose();
      }
    }
  }

  onCompleted() {
    if (this._active) {
      this._active = false;
      try {
        this.completed();
      } finally {
        this.dispose();
      }
    }
  }

  dispose(): void {
    this._active = false;
    if (!this._disposed) {
      this._disposed = true;
      if (this._disposable) {
        this._disposable.dispose();
      }
    }
  }

  setDisposable(disposable: Subscription): void {
    invariant(
      !this._disposable,
      '%s: attempting to set disposable more than once',
      this.constructor.name
    );

    this._disposable = disposable;
    if (this._disposed) {
      this._disposable.dispose();
    }
  }

  // not sure if necessary, just hides other methods
  asObserver(): SubscriptionCallbacks  {
    return {
      onNext: (data) => this.onNext(data),
      onError: (error) => this.onError(error),
      onCompleted: () => this.onCompleted(),
    };
  }

  asDisposable(): Subscription {
    return {
      dispose: () => this.dispose(),
    };
  }

}

/**
 * RelaySubscriptionObserver is created when a user subscribes an instance of
 * RelaySubscription.  It handles the creation of the RelayQuery.Subscription
 * as well as writing the subscription payload to the RelayStoreData.
 */
class RelaySubscriptionObserver extends AbstractObserver {
  id: ClientSubscriptionID;

  _callbacks: ?SubscriptionCallbacks;
  _storeData: RelayStoreData;
  _subscription: RelaySubscription;

  _inputVariable: Variables;
  _query: RelayQuery.Subscription;
  _subscriptionNode: ConcreteSubscription;
  _configs: Array<RelayMutationConfig>;


  constructor(
    storeData: RelayStoreData,
    subscription: RelaySubscription,
    callbacks?: SubscriptionCallbacks) {

    super();

    this.id = base62(subscriptionIDCounter++);

    this._storeData = storeData;
    this._subscription = subscription;
    this._callbacks = callbacks;
  }

  getQuery(): RelayQuery.Subscription {
    if (!this._query) {
      this._query = buildSubscriptionQuery(
        this.getSubscriptionNode(),
        this.getInputVariable(),
        this.getConfigs()
      );
    }
    return this._query;
  }

  getInputVariable(): Variables {
    if (!this._inputVariable) {
      this._inputVariable = {
        ...this._subscription.getVariables(),
        [CLIENT_SUBSCRIPTION_ID]: this.id,
      };
    }
    return this._inputVariable;
  }

  getSubscriptionNode(): ConcreteSubscription {
    if (!this._subscriptionNode) {
      const subscriptionNode = QueryBuilder.getSubscription(this._subscription.getSubscription());
      invariant(
        subscriptionNode,
        'RelaySubscription: Expected `getSubscription` to return a subscription created ' +
        'with Relay.QL`subscription { ... }`.'
      );
      this._subscriptionNode = subscriptionNode;
    }
    return this._subscriptionNode;
  }

  getConfigs(): Array<RelayMutationConfig> {
    if (!this._configs) {
      this._configs = this._subscription.getConfigs();
    }
    return this._configs;
  }

  next(data: SubscriptionResult) {
    const query = this.getQuery();
    const payload = data.response[query.getCall().name];

    this._storeData.handleUpdatePayload(
      query,
      payload,
      {
        configs: this.getConfigs(),
        isOptimisticUpdate: false,
      }
    );

    if (this._callbacks && this._callbacks.onNext) {
      this._callbacks.onNext(payload);
    }
  }

  error(error: any) {
    if (this._callbacks && this._callbacks.onError) {
      this._callbacks.onError(error);
    }
  }

  completed() {
    if (this._callbacks && this._callbacks.onCompleted) {
      this._callbacks.onCompleted();
    }
  }

}

module.exports = RelaySubscriptionObserver;
