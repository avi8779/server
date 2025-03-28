import crypto from 'crypto';

import asyncHandler from '../middlewares/asyncHandler.middleware.js';
import User from '../models/user.model.js';
import AppError from '../utils/AppError.js';
import { razorpay } from '../server.js';
import Payment from '../models/Payment.model.js';

/**
 * @ACTIVATE_SUBSCRIPTION
 * @ROUTE @POST {{URL}}/api/v1/payments/subscribe
 * @ACCESS Private (Logged in user only)
 */
export const buySubscription = asyncHandler(async (req, res, next) => {
  // Extracting ID from request object (authenticated user)
  const { id } = req.user;

  // Finding the user based on the ID
  const user = await User.findById(id);

  if (!user) {
    return next(new AppError('Unauthorized, please login', 401));
  }

  // Checking if the user is an admin
  if (user.role === 'ADMIN') {
    return next(new AppError('Admins cannot purchase a subscription', 400));
  }

  // Creating a subscription using Razorpay that we imported from the server
  const subscription = await razorpay.subscriptions.create({
    plan_id: process.env.RAZORPAY_PLAN_ID, // The unique plan ID
    customer_notify: 1, // Razorpay will handle notifying the customer
    total_count: 12, // Charge every month for 1-year subscription
  });

  // Adding the subscription ID and status to the user account
  user.subscription.id = subscription.id;
  user.subscription.status = subscription.status;

  // Saving the user document with updated subscription details
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Subscribed successfully',
    subscription_id: subscription.id,
  });
});

/**
 * @VERIFY_SUBSCRIPTION
 * @ROUTE @POST {{URL}}/api/v1/payments/verify
 * @ACCESS Private (Logged in user only)
 */
export const verifySubscription = asyncHandler(async (req, res, next) => {
  const { id } = req.user;
  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;

  // Finding the user
  const user = await User.findById(id);

  // Getting the subscription ID from the user object
  const subscriptionId = user.subscription.id;

  // Generating a signature with SHA256 for verification purposes
  // Here the subscriptionId should be the one which we saved in the DB
  // razorpay_payment_id is from the frontend and there should be a '|' character between this and subscriptionId
  // At the end convert it to Hex value
  const generatedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_SECRET)
    .update(`${razorpay_payment_id}|${subscriptionId}`)
    .digest('hex');

  // Check if generated signature and signature received from the frontend is the same or not
  if (generatedSignature !== razorpay_signature) {
    return next(new AppError('Payment not verified, please try again.', 400));
  }

  // If they match create payment and store it in the DB
  await Payment.create({
    razorpay_payment_id,
    razorpay_subscription_id,
    razorpay_signature,
  });

  // Update the user subscription status to active (This will be created before this)
  user.subscription.status = 'active';

  // Save the user in the DB with any changes
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Payment verified successfully',
  });
});



/**
 * @CANCEL_SUBSCRIPTION
 * @ROUTE @POST {{URL}}/api/v1/payments/unsubscribe
 * @ACCESS Private (Logged in user only)
 */
export const cancelSubscription = asyncHandler(async (req, res, next) => {
  const { id } = req.user;
  console.log(`Cancelling subscription for user ID: ${id}`);

  const user = await User.findById(id);
  if (!user) {
    console.error("User not found");
    return next(new AppError("User not found", 404));
  }

  // Prevent admins from canceling subscription
  if (user.role === 'ADMIN') {
    console.error("Admin cannot cancel subscription");
    return next(new AppError('Admin cannot cancel subscription', 400));
  }

  const subscriptionId = user?.subscription?.id;
  if (!subscriptionId) {
    console.error("Subscription ID not found");
    return next(new AppError('No active subscription found', 400));
  }

  // Check if subscription is already inactive or cancelled
  if (user.subscription.status === 'inactive' || user.subscription.status === 'cancelled') {
    console.log("Subscription is already cancelled or inactive.");
    return next(new AppError('Subscription is already cancelled or inactive.', 400));
  }

  try {
    console.log(`Attempting to cancel subscription with ID: ${subscriptionId}`);
    
    // Attempt to cancel using Razorpay
    const subscription = await razorpay.subscriptions.cancel(subscriptionId);
    console.log(`Cancellation response: ${JSON.stringify(subscription)}`);

    // Check for valid status from Razorpay
    if (subscription.status !== 'inactive' && subscription.status !== 'cancelled') {
      console.error('Unexpected status returned:', subscription.status);
      return next(new AppError('Failed to cancel subscription properly', 500));
    }

    // Update user status to 'inactive'
    user.subscription.status = 'inactive'; // Use 'inactive' instead of 'cancelled'
    await user.save();
  } catch (error) {
    console.error(`Error from Razorpay: ${JSON.stringify(error)}`);
    return next(new AppError(error.error.description || 'Failed to cancel subscription', error.statusCode || 500));
  }

  // Handle refunds if within refund period
  const payment = await Payment.findOne({
    razorpay_subscription_id: subscriptionId,
  });

  if (!payment) {
    console.error("Payment record not found");
    return next(new AppError("Payment record not found", 400));
  }

  const timeSinceSubscribed = Date.now() - payment.createdAt;
  const refundPeriod = 14 * 24 * 60 * 60 * 1000;

  if (timeSinceSubscribed > refundPeriod) {
    console.error("Refund period is over");
    return next(new AppError("Refund period is over, no refunds will be provided.", 400));
  }

  try {
    console.log(`Attempting to refund payment ID: ${payment.razorpay_payment_id}`);
    await razorpay.payments.refund(payment.razorpay_payment_id, {
      speed: 'optimum',
    });

    console.log("Refund successful");

    user.subscription.id = undefined;
    user.subscription.status = undefined;
    await user.save();

    await payment.remove();
  } catch (error) {
    console.error(`Refund error: ${JSON.stringify(error)}`);
    return next(new AppError(error.error.description || 'Failed to process refund', error.statusCode || 500));
  }

  res.status(200).json({
    success: true,
    message: 'Subscription canceled and refunded successfully',
  });
});




/**
 * @GET_RAZORPAY_ID
 * @ROUTE @POST {{URL}}/api/v1/payments/razorpay-key
 * @ACCESS Public
 */
export const getRazorpayApiKey = asyncHandler(async (_req, res, _next) => {
  res.status(200).json({
    success: true,
    message: 'Razorpay API key retrieved successfully',
    key: process.env.RAZORPAY_KEY_ID,
  });
});

/**
 * @GET_RAZORPAY_PAYMENTS
 * @ROUTE @GET {{URL}}/api/v1/payments
 * @ACCESS Private (ADMIN only)
 */
export const allPayments = asyncHandler(async (req, res, _next) => {
  const { count, skip } = req.query;

  // Fetching all subscriptions from Razorpay
  const allPayments = await razorpay.subscriptions.all({
    count: count || 10, // Default to 10 if not provided
    skip: skip || 0,    // Default to 0 if not provided
  });

  // Processing monthly payments statistics
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December',
  ];

  const finalMonths = monthNames.reduce((acc, month) => {
    acc[month] = 0;
    return acc;
  }, {});

  const monthlyWisePayments = allPayments.items.map((payment) => {
    const monthsInNumbers = new Date(payment.start_at * 1000);
    return monthNames[monthsInNumbers.getMonth()];
  });

  monthlyWisePayments.forEach((month) => {
    finalMonths[month]++;
  });

  const monthlySalesRecord = Object.values(finalMonths);

  res.status(200).json({
    success: true,
    message: 'All payments fetched successfully',
    allPayments,
    finalMonths,
    monthlySalesRecord,
  });
});
