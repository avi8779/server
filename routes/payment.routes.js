import { Router } from 'express';
import {
  getRazorpayApiKey,
  buySubscription,
  verifySubscription,  // Changed to verifyPayment for consistency with controller
  cancelSubscription,
  allPayments,
} from '../controllers/payment.controller.js';
import {
  authorizeRoles,
  authorizeSubscribers,
  isLoggedIn,
} from '../middlewares/auth.middleware.js';

const router = Router();

// Subscription route - Buy subscription
router.route('/subscribe').post(isLoggedIn, buySubscription);

// Payment verification route
router.route('/verify').post(isLoggedIn, verifySubscription);  // Make sure you're using verifyPayment here for payment verification

// Unsubscribe route - Cancel subscription
router.route('/unsubscribe')
  .post(isLoggedIn, authorizeSubscribers, cancelSubscription);

// Razorpay API key route
router.route('/razorpay-key').get(isLoggedIn, getRazorpayApiKey);

// Get all payments (only accessible to Admin)
router.route('/')
  .get(isLoggedIn, authorizeRoles('ADMIN'), allPayments);

export default router;
