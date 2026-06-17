const mongoose = require("mongoose");
const Generation = require("../../models/Generation");
const Theme = require("../../models/Theme");
const { getFirebaseDownloadUrl } = require("../../utils/storageUtils");

function toObjectIdOrNull(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

module.exports = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      profile_id,
      theme_id,
      status,
      payment_type,
      date_from,
      date_to,
      page,
      limit,
      sort_by = "created_at",
      sort_order = "desc",
      count,
    } = req.query;

    const filters = {
      user_id: toObjectIdOrNull(userId),
      output_image_url: { $exists: true, $ne: null },
    };

    const profileObjectId = toObjectIdOrNull(profile_id);
    if (profile_id && !profileObjectId) {
      return res.status(400).json({
        error_code: "INVALID_PROFILE_ID",
        message: "profile_id is invalid",
      });
    }
    if (profileObjectId) filters.baby_profile_id = profileObjectId;

    const themeObjectId = toObjectIdOrNull(theme_id);
    if (theme_id && !themeObjectId) {
      return res.status(400).json({
        error_code: "INVALID_THEME_ID",
        message: "theme_id is invalid",
      });
    }
    if (themeObjectId) filters.theme_id = themeObjectId;

    if (status) filters.status = status;
    if (payment_type) filters.payment_type = payment_type;

    if (date_from || date_to) {
      filters.created_at = {};
      if (date_from) {
        const from = new Date(date_from);
        if (Number.isNaN(from.getTime())) {
          return res.status(400).json({
            error_code: "INVALID_DATE_FROM",
            message: "date_from must be a valid date",
          });
        }
        filters.created_at.$gte = from;
      }
      if (date_to) {
        const to = new Date(date_to);
        if (Number.isNaN(to.getTime())) {
          return res.status(400).json({
            error_code: "INVALID_DATE_TO",
            message: "date_to must be a valid date",
          });
        }
        filters.created_at.$lte = to;
      }
    }

    const allowedSortFields = ["created_at", "updated_at"];
    const finalSortBy = allowedSortFields.includes(sort_by)
      ? sort_by
      : "created_at";
    const finalSortOrder = String(sort_order).toLowerCase() === "asc" ? 1 : -1;

    const query = Generation.find(filters).sort({ [finalSortBy]: finalSortOrder });

    let parsedPage = null;
    let parsedLimit = null;

    if (count !== undefined) {
      const parsedCount = Math.max(1, Number(count) || 5);
      query.limit(parsedCount);
    } else if (page !== undefined || limit !== undefined) {
      parsedPage = Math.max(1, Number(page) || 1);
      parsedLimit = Math.min(100, Math.max(1, Number(limit) || 20));
      const skip = (parsedPage - 1) * parsedLimit;
      query.skip(skip).limit(parsedLimit);
    }

    const [total, generations] = await Promise.all([
      Generation.countDocuments(filters),
      query
        .populate("baby_profile_id", "_id reference_image_url identity_json created_at updated_at")
        .populate("theme_id", "_id label description image_url badge is_active category_id createdAt updatedAt")
        .lean(),
    ]);

    const photos = await Promise.all(
      generations.map(async (generation) => {
        let themeDetails = generation.theme_id || null;

        if (!themeDetails && generation.theme_selected) {
          themeDetails = await Theme.findOne({ label: generation.theme_selected })
            .select("_id label description image_url badge is_active category_id createdAt updatedAt")
            .lean();
        }

        if (themeDetails?.image_url) {
          themeDetails.image_url = await getFirebaseDownloadUrl(themeDetails.image_url);
        }

        const outputImageUrl = generation.output_image_url
          ? await getFirebaseDownloadUrl(generation.output_image_url)
          : null;

        const profileDetails = generation.baby_profile_id
          ? {
              _id: generation.baby_profile_id._id,
              reference_image_url: await getFirebaseDownloadUrl(
                generation.baby_profile_id.reference_image_url,
              ),
              identity_json: generation.baby_profile_id.identity_json,
              created_at: generation.baby_profile_id.created_at,
              updated_at: generation.baby_profile_id.updated_at,
            }
          : null;

        return {
          generation_id: generation._id,
          output_image_url: outputImageUrl,
          payment_type: generation.payment_type,
          status: generation.status,
          created_at: generation.created_at,
          updated_at: generation.updated_at,
          profile: profileDetails,
          theme: themeDetails,
        };
      }),
    );

    return res.status(200).json({
      message: "My photos fetched successfully",
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        total_pages: parsedLimit ? Math.ceil(total / parsedLimit) : 1,
      },
      filters: {
        profile_id: profile_id || null,
        theme_id: theme_id || null,
        status: status || null,
        payment_type: payment_type || null,
        date_from: date_from || null,
        date_to: date_to || null,
        sort_by: finalSortBy,
        sort_order: finalSortOrder === 1 ? "asc" : "desc",
      },
      photos,
    });
  } catch (error) {
    console.error("My photos error:", error);
    return res.status(500).json({
      message: "Failed to fetch my photos",
      error: error.message,
    });
  }
};
