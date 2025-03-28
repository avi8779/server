import { Schema, model } from 'mongoose';

const subscriptionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',  // Reference to the User model
      required: true,
    },
    razorpay_subscription_id: {
      type: String,
      required: true,
      unique: true,  // Ensure each subscription ID is unique
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'created',],  // The status can be one of these values
      default: 'inactive',
    },
    start_date: {
      type: Date,
      default: Date.now,
    },
    end_date: Date,  // Store subscription expiration date if needed
  },
  {
    timestamps: true,
  }
);

const Subscription = model('Subscription', subscriptionSchema);

export default Subscription;
