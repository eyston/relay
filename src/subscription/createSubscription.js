/**
 * Copyright 2013-2015, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule createSubscription
 * @typechecks
 * @flow
 */

import type RelaySubscription from 'RelaySubscription';
import type RelayStoreData from 'RelayStoreData';

const RelayNetworkLayer = require('RelayNetworkLayer');
const RelaySubscriptionObserver = require('RelaySubscriptionObserver');
const RelaySubscriptionRequest = require('RelaySubscriptionRequest');

import type {
  SubscriptionCallbacks,
  Subscription,
} from 'RelayTypes';

/**
 * `createSubscription` activates a user defined subscription by sending it
 * to the network layer.
 *
 * This could be put on some kind of `SubscriptionManager` object if there
 * were a requirement to be able to view all active subscriptions or dispose
 * all active subscriptions.  The `RelayStoreData` would then have a single
 * instance of this.
 */
function createSubscription(
  storeData: RelayStoreData,
  subscription: RelaySubscription,
  callbacks?: SubscriptionCallbacks
): Subscription {

  const observer = new RelaySubscriptionObserver(
    storeData,
    subscription,
    callbacks
  );

  const request = new RelaySubscriptionRequest(
    observer.getQuery(),
    observer.asObserver()
  );

  // the network layer returns a disposable which will clean up / close any
  // resources associated with the subscription
  const disposable = RelayNetworkLayer.sendSubscription(request);
  observer.setDisposable(disposable);

  return observer.asDisposable();
}

module.exports = createSubscription;
