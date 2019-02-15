"use strict"

class Order {
  constructor(is_buy, amount, price, user, timestamp) {
    this.is_buy = is_buy;
    this.amount = amount;
    this.price = price;
    this.user = user;
    this.timestamp = timestamp;
  } 
}

/**
 * Add order to order book database, without performing any matching.
 * @param {keyValueStore} db - OrbitDB key value database holding order book.
 * @param {Order} order - Contains details of order to add.
 */
async function addOrder(db, order) {

  let order_ts = new Date().getTime();
  order.timestamp = new Date().getTime();

  if (db.get(order.price) === undefined) {
    await db.put(order.price, [order]);
  } else {
    let queue = db.get(order.price);
    queue.push(order);
    await db.set(order.price, queue);
  }

  // Update best bid/ask
  let metadata = db.get("metadata");
  if (order.is_buy === true) {
    if ((metadata.best_bid === undefined) || (order.price > metadata.best_bid)) {
      metadata.best_bid = order.price;
      await db.set("metadata", metadata);
    }
    if ((metadata.worst_bid === undefined)||(order.price < metadata.worst_bid)) {
      metadata.worst_bid = order.price;
      await db.set("metadata", metadata);
    }

  } else {
    if ((metadata.best_ask === undefined) || (order.price < metadata.best_ask)) {
      metadata.best_ask = order.price;
      await db.set("metadata", metadata);
    }
    if ((metadata.worst_ask === undefined)||(order.price > metadata.worst_ask)) {
      metadata.worst_ask = order.price;
      await
      db.set("metadata", metadata);
    }
  }

  return order.timestamp;
}

/**
 * Cancel order in order book database
 * @param {keyValueStore} db - OrbitDB key value database holding order book.
 * @param {Order} order - Contains details of order to cancel.
 */
async function cancelOrder(db, order) {

  await removeOrder(db, order);

  await updateMetadataAfterOrderRemoval(db, order);
}

/**
 * Remove order in order book database
 * @param {keyValueStore} db - OrbitDB key value database holding order book.
 * @param {Order} order - Contains details of order to remove.
 */
async function removeOrder(db, order) {

  let queue = db.get(order.price);

  if (queue === undefined || queue.length === 0)
    throw new Error("InvalidOrder");
 
  // Find index of order to remove
  let i;
  let found = false;
  for (i = 0; i < queue.length; i++) {
    if (queue[i].timestamp === order.timestamp &&
        queue[i].user === order.user &&
        queue[i].is_buy === order.is_buy) {
      found = true;
      break;
    }
  }
  // Didn't find target order in queue
  if (!found)
    throw new Error("InvalidOrder");

  // Remove order
  queue.splice(i, 1);

  // Put updated queue into database
  await db.set(order.price, queue);
}

/**
 * Update metadata fields after removing order from order book database
 * @param {keyValueStore} db - OrbitDB key value database holding order book.
 * @param {Order} order - Contains details of order to remove.
 */
async function updateMetadataAfterOrderRemoval(db, order) {

  let metadata = db.get("metadata");

  // Return from function if price is not at best/worst bid/ask
  if (order.is_buy && order.price !== metadata.worst_bid && order.price !== metadata.best_bid)
    return;

  if (!order.is_buy && order.price !== metadata.worst_ask && order.price !== metadata.best_ask)
    return;

  // Return from function if at least one order at price level
  if (db.get(order.price).length > 0)
    return;

  // Get start and end prices of range to search through
  let start_price, end_price;
  if (order.is_buy) {
    start_price = metadata.worst_bid;
    end_price = metadata.best_bid;
  } else {
    start_price = metadata.best_ask;
    end_price = metadata.worst_ask;
  }

  // Search through possible price levels to find min and max values
  let min_val = undefined;
  let max_val = undefined;
  for (let price_lvl = start_price; price_lvl <= end_price; price_lvl += metadata.tick_size) {
    // Check price level exists in database
    if (db.get(price_lvl) !== undefined && db.get(price_lvl).length > 0) {
      if (min_val === undefined)
        min_val = price_lvl;
      if (max_val === undefined || price_lvl > max_val)
        max_val = price_lvl;
    }
  }

  // Update metadata
  if (order.is_buy) {
    metadata.worst_bid = min_val;
    metadata.best_bid = max_val;
  } else {
    metadata.best_ask = min_val;
    metadata.worst_ask = max_val;
  }

  await db.set("metadata", metadata);
}

/**
 * Remove part of the amount from an order in order book database
 * @param {keyValueStore} db - OrbitDB key value database holding order book.
 * @param {Order} order - Contains details of order to modify.
 * @param {int} amount - Amount to deplete order by.
 */
async function depleteOrder(db, order, amount) {

  let queue = db.get(order.price);

  if (queue === undefined || queue.length === 0)
    throw new Error("InvalidOrder");
  
  // Find index of order to remove
  let i;
  let found = false;
  for (i = 0; i < queue.length; i++) {
    if (queue[i].timestamp === order.timestamp &&
        queue[i].user === order.user &&
        queue[i].is_buy === order.is_buy) {
      found = true;
      break;
    }
  }
  // Didn't find target order in queue
  if (!found)
    throw new Error("InvalidOrder");

  // Check that order contains sufficient units to perform depletion
  if (queue[i].amount < amount)
    throw new Error("InvalidDepletionAmount");

  // Check that depletion amount does not fully deplete order
  if (queue[i].amount == amount)
    throw new Error("InvalidDepletionAmount");

  // Deplete amount
  queue[i].amount -= amount;

  // Put updated queue into database
  await db.set(order.price, queue);
}

module.exports = {
  addOrder: addOrder,
  cancelOrder: cancelOrder,
  Order: Order,
  depleteOrder: depleteOrder
}