import mongoose, { Schema } from "mongoose";

const subscriptionSchema = new Schema({
  // Reference to the subscriber (the user who is subscribing)
  subscriber: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },

  // Reference to the channel (the user who is being subscribed to)
  channel: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
});

export const Subscription = mongoose.model("Subscription", subscriptionSchema);
