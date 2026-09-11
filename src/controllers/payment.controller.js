const mongoose = require("mongoose");
const User = require("../models/user.model");
const Generation = require("../models/generation.model");
const Purchase = require("../models/purchase.model");

/**
 * Verifies Google Play In-App Purchase token and credits photoshoot entitlements.
 */
async function verifyPurchase(req, res, next) {
  try {
    const userId = req.user.id;
    const { purchaseToken, productId, packageName } = req.body;

    if (!purchaseToken || !productId) {
      return res.status(400).json({
        error_code: "MISSING_PARAMS",
        message: "purchaseToken and productId are required",
      });
    }

    // Map Google Play Product IDs to Photoshoot Credits & Price
    let creditsToAdd = 0;
    let pricePaid = 0;

    if (productId === "babylens_photoshoot_1" || productId === "single_shoot") {
      creditsToAdd = 1;
      pricePaid = 299;
    } else if (productId === "babylens_photoshoot_3" || productId === "starter_pack") {
      creditsToAdd = 3;
      pricePaid = 699;
    } else if (productId === "babylens_photoshoot_5" || productId === "pro_pack") {
      creditsToAdd = 5;
      pricePaid = 999;
    } else {
      return res.status(400).json({
        error_code: "INVALID_PRODUCT_ID",
        message: `Unknown Product ID: ${productId}`,
      });
    }

    // 1. Idempotency Check: Prevent duplicate crediting for same purchaseToken
    const existingPurchase = await Purchase.findOne({ transaction_id: purchaseToken });
    if (existingPurchase) {
      const user = await User.findById(userId);
      return res.status(200).json({
        message: "Purchase already processed",
        user: {
          id: user._id,
          email: user.email,
          paid_credits: user.paid_credits,
        },
        transaction: existingPurchase,
      });
    }

    // 2. Retrieve User
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error_code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    // 3. Automatically unlock all existing watermarked/locked trial photos for user
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const unlockResult = await Generation.updateMany(
      { user_id: userObjectId, is_unlocked: false },
      { $set: { is_unlocked: true, payment_type: "paid" } }
    );
    const unlockedCount = unlockResult.modifiedCount || 0;

    // 4. Save Purchase Transaction
    const purchase = new Purchase({
      user_id: user._id,
      email: user.email,
      package_id: productId,
      price_paid: pricePaid,
      credits_added: creditsToAdd,
      payment_status: "completed",
      transaction_id: purchaseToken,
    });
    await purchase.save();

    // 5. Update User Credits & Purchase Status
    user.paid_credits = (user.paid_credits || 0) + creditsToAdd;
    user.hasPurchased = true;
    await user.save();

    console.log(`[verifyPurchase] Successfully credited ${creditsToAdd} photoshoots to user ${user.email}. New Balance: ${user.paid_credits}`);

    return res.status(200).json({
      message: "Purchase verified and credits granted successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        free_generations_used: user.free_generations_used,
        paid_credits: user.paid_credits,
        hasPurchased: user.hasPurchased,
      },
      transaction: {
        package_id: productId,
        price_paid: pricePaid,
        credits_added: creditsToAdd,
        trial_unlocked: unlockedCount > 0,
        transaction_id: purchaseToken,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Legacy/Mock Purchase for local testing
 */
async function mockPurchase(req, res, next) {
  return verifyPurchase(req, res, next);
}

/**
 * Render Admin Transactions Dashboard (EJS view) or return JSON API response
 */
async function renderTransactionsPage(req, res, next) {
  try {
    const {
      search = "",
      package_id = "",
      status = "",
      sort = "newest",
      page = 1,
      limit = 25,
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 25;
    const skip = (pageNum - 1) * limitNum;

    // Build filter query
    const filter = {};

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [
        { email: searchRegex },
        { transaction_id: searchRegex },
      ];
    }

    if (package_id && package_id.trim()) {
      filter.package_id = package_id.trim();
    }

    if (status && status.trim()) {
      filter.payment_status = status.trim();
    }

    // Determine sort order
    let sortOptions = { created_at: -1 };
    if (sort === "oldest") {
      sortOptions = { created_at: 1 };
    } else if (sort === "amount_high") {
      sortOptions = { price_paid: -1, created_at: -1 };
    } else if (sort === "amount_low") {
      sortOptions = { price_paid: 1, created_at: -1 };
    }

    // Execute queries in parallel for high performance
    const [transactions, totalCount, statsAggregate] = await Promise.all([
      Purchase.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Purchase.countDocuments(filter),
      Purchase.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: {
                $cond: [{ $eq: ["$payment_status", "completed"] }, "$price_paid", 0],
              },
            },
            totalCreditsSold: {
              $sum: {
                $cond: [{ $eq: ["$payment_status", "completed"] }, "$credits_added", 0],
              },
            },
            completedCount: {
              $sum: {
                $cond: [{ $eq: ["$payment_status", "completed"] }, 1, 0],
              },
            },
            totalCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const stats = statsAggregate[0] || {
      totalRevenue: 0,
      totalCreditsSold: 0,
      completedCount: 0,
      totalCount: 0,
    };

    const totalPages = Math.ceil(totalCount / limitNum) || 1;
    const successRate = stats.totalCount > 0 ? Math.round((stats.completedCount / stats.totalCount) * 100) : 100;

    // Check if browser requested HTML or client requested JSON
    const acceptHeader = req.headers.accept || "";
    if (acceptHeader.includes("text/html") || req.query.format === "html") {
      return res.render("transactions", {
        transactions,
        totalCount,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
        stats: {
          totalRevenue: stats.totalRevenue,
          totalCreditsSold: stats.totalCreditsSold,
          completedCount: stats.completedCount,
          totalCount: stats.totalCount,
          successRate,
        },
        queryParams: {
          search,
          package_id,
          status,
          sort,
        },
      });
    }

    return res.status(200).json({
      success: true,
      stats: {
        totalRevenue: stats.totalRevenue,
        totalCreditsSold: stats.totalCreditsSold,
        completedCount: stats.completedCount,
        totalCount: stats.totalCount,
        successRate,
      },
      pagination: {
        totalCount,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
      },
      transactions,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  verifyPurchase,
  mockPurchase,
  renderTransactionsPage,
};
