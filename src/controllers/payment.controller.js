const mongoose = require("mongoose");
const User = require("../models/user.model");
const Generation = require("../models/generation.model");
const Purchase = require("../models/purchase.model");

/**
 * Simulates a payment checkout for photoshoot packages.
 * Increments paid photoshoot credits in database and unlocks trial image if requested.
 */
async function mockPurchase(req, res, next) {
  try {
    const userId = req.user.id; // Injected by requireAuth middleware
    const { packageId } = req.body;

    if (!packageId) {
      return res.status(400).json({
        error_code: "MISSING_PACKAGE_ID",
        message: "packageId is required",
      });
    }

    // Map packages to photoshoot credit counts and prices in INR (₹)
    let creditsToAdd = 0;
    let pricePaid = 0;
    if (packageId === "single_shoot") {
      creditsToAdd = 1;
      pricePaid = 299;
    } else if (packageId === "starter_pack") {
      creditsToAdd = 3;
      pricePaid = 699;
    } else if (packageId === "pro_pack") {
      creditsToAdd = 5;
      pricePaid = 999;
    } else {
      return res.status(400).json({
        error_code: "INVALID_PACKAGE_ID",
        message: "packageId must be one of: single_shoot, starter_pack, pro_pack",
      });
    }

    // 1. Retrieve the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error_code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    let trialUnlocked = false;

    // Cast the userId string explicitly to a MongoDB ObjectId to ensure Mongoose matches the collection indexes
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 2. Unlock ALL previously locked photoshoots for this user (First purchase / any purchase bonus)
    // This ensures any purchase (from Profile, Home, or Dropdown) opens all existing locked photos immediately.
    const unlockResult = await Generation.updateMany(
      { user_id: userObjectId, is_unlocked: false },
      { $set: { is_unlocked: true, payment_type: "paid" } }
    );
    const unlockedCount = unlockResult.modifiedCount || 0;
    if (unlockedCount > 0) {
      trialUnlocked = true;
      console.log(`[paymentController] Automatically unlocked ${unlockedCount} locked photoshoots for user ${userId}`);
    }

    // 3. Record the transaction in the Purchase collection
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const purchase = new Purchase({
      user_id: user._id,
      email: user.email,
      package_id: packageId,
      price_paid: pricePaid,
      credits_added: creditsToAdd,
      payment_status: "completed",
      transaction_id: transactionId,
    });
    await purchase.save();
    console.log(`[paymentController] Logged transaction ${transactionId} for user ${userId} (${user.email})`);

    // 4. Increment credits
    user.paid_credits = (user.paid_credits || 0) + creditsToAdd;
    await user.save();

    console.log(`[paymentController] Added ${creditsToAdd} credits to user ${userId}. New balance: ${user.paid_credits}`);

    return res.status(200).json({
      message: "Simulated purchase successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        free_generations_used: user.free_generations_used,
        paid_credits: user.paid_credits,
      },
      transaction: {
        package_id: packageId,
        price_paid: pricePaid,
        credits_added: creditsToAdd,
        trial_unlocked: trialUnlocked,
        transaction_id: transactionId,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  mockPurchase,
};
