const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const authBaseUrl = (
  process.env.BETTER_AUTH_URL ||
  process.env.CLIENT_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "");
const allowedOrigins = new Set(
  [
    process.env.CLIENT_URL,
    process.env.BETTER_AUTH_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]
    .filter(Boolean)
    .map((origin) => origin.replace(/\/+$/, "")),
);

// Middleware
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json());

const requireRole = (requiredRole) => async (req, res, next) => {
  const cookie = req.get("cookie");
  if (!cookie) {
    return res.status(401).json({
      success: false,
      message: "Authentication is required",
    });
  }

  try {
    const sessionResponse = await fetch(`${authBaseUrl}/api/auth/get-session`, {
      headers: {
        cookie,
        accept: "application/json",
      },
      cache: "no-store",
    });

    if (!sessionResponse.ok) {
      console.error(
        "Better Auth session verification returned:",
        sessionResponse.status,
      );
      return res.status(503).json({
        success: false,
        message: "Unable to verify your session. Please try again.",
      });
    }

    const session = await sessionResponse.json();
    if (!session?.user) {
      return res.status(401).json({
        success: false,
        message: "A valid session is required",
      });
    }

    if (session.user.role !== requiredRole) {
      return res.status(403).json({
        success: false,
        message: `${requiredRole} access is required`,
      });
    }

    req.authUser = session.user;
    return next();
  } catch (error) {
    console.error("Error verifying Better Auth session:", error);
    return res.status(503).json({
      success: false,
      message: "Unable to verify your session. Please try again.",
    });
  }
};

// MongoDB Connection
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Database and Collections
let db;
let userCollection;
let clubCollection;
let eventCollection;
let membershipCollection;
let joinRequestCollection;
let contestCollection;
let resourceCollection;
let webHackathonCollection;
let webResourceCollection;
// Routes
app.get("/", (req, res) => {
  res.send("Coding Hub Server is Running!");
});

async function run() {
  try {
    await client.connect();

    db = client.db("CodingHub");

    // Collections
    userCollection = db.collection("user");
    clubCollection = db.collection("clubs");
    eventCollection = db.collection("events");
    membershipCollection = db.collection("memberships");
    joinRequestCollection = db.collection("joinRequests");
    contestCollection = db.collection("contests");
    resourceCollection = db.collection("resources");

    // Web Development Club Collections
    webHackathonCollection = db.collection("webHackathons");
    webResourceCollection = db.collection("webResources");
    // ===================================
    // CLUB MANAGEMENT ROUTES
    // ===================================

    // 1. Get All Clubs
    app.get("/api/clubs", async (req, res) => {
      try {
        const clubs = await clubCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        return res.status(200).json({
          success: true,
          total: clubs.length,
          clubs,
        });
      } catch (error) {
        console.error("Error fetching clubs:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch clubs",
        });
      }
    });

    // 2. Get Single Club
    app.get("/api/clubs/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid club ID",
          });
        }

        const club = await clubCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!club) {
          return res.status(404).json({
            success: false,
            message: "Club not found",
          });
        }

        return res.status(200).json({
          success: true,
          club,
        });
      } catch (error) {
        console.error("Error fetching club:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch club",
        });
      }
    });

    // 3. Create New Club
    app.post("/api/clubs", async (req, res) => {
      try {
        const {
          name,
          shortDescription,
          description,
          logo,
          coverImage,
          category,
          foundedAt,
          mission,
          vision,
          email,
          socialLinks,
          meetingSchedule,
          meetingLocation,
        } = req.body;

        const allowedCategories = [
          "Programming",
          "Web Development",
          "Competitive Programming",
          "Artificial Intelligence",
          "Cyber Security",
          "Robotics",
          "Other",
        ];
        const isValidOptionalUrl = (value) => {
          if (!value) return true;
          try {
            const url = new URL(value);
            return ["http:", "https:"].includes(url.protocol);
          } catch {
            return false;
          }
        };
        const normalizedName = typeof name === "string" ? name.trim() : "";

        if (
          !normalizedName ||
          typeof shortDescription !== "string" ||
          !shortDescription.trim()
        ) {
          return res.status(400).json({
            success: false,
            message: "Club name and short description are required",
          });
        }

        if (shortDescription.trim().length > 200) {
          return res.status(400).json({
            success: false,
            message: "Short description must be 200 characters or fewer",
          });
        }

        if (
          typeof logo !== "string" ||
          !isValidOptionalUrl(logo) ||
          !logo.trim()
        ) {
          return res.status(400).json({
            success: false,
            message: "A valid club logo URL is required",
          });
        }

        if (!allowedCategories.includes(category)) {
          return res.status(400).json({
            success: false,
            message: "Choose a valid club category",
          });
        }

        if (
          email &&
          (typeof email !== "string" ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        ) {
          return res.status(400).json({
            success: false,
            message: "Enter a valid official email address",
          });
        }

        const facebook = socialLinks?.facebook || "";
        const website = socialLinks?.website || "";
        if (
          !isValidOptionalUrl(facebook) ||
          !isValidOptionalUrl(website) ||
          !isValidOptionalUrl(coverImage || "")
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Facebook, website, and cover image must be valid HTTP or HTTPS URLs",
          });
        }

        const foundedDate = foundedAt ? new Date(foundedAt) : null;
        if (foundedAt && Number.isNaN(foundedDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Founded date must be a valid date",
          });
        }

        // Check duplicate club
        const existingClub = await clubCollection.findOne({
          name: normalizedName,
        });

        if (existingClub) {
          return res.status(409).json({
            success: false,
            message: "Club already exists",
          });
        }

        const newClub = {
          name: normalizedName,
          shortDescription: shortDescription.trim(),
          description:
            typeof description === "string" ? description.trim() : "",
          logo: logo.trim(),
          coverImage: typeof coverImage === "string" ? coverImage.trim() : "",
          category,
          foundedAt: foundedDate,
          mission: typeof mission === "string" ? mission.trim() : "",
          vision: typeof vision === "string" ? vision.trim() : "",
          email: typeof email === "string" ? email.trim() : "",
          socialLinks: {
            facebook: typeof facebook === "string" ? facebook.trim() : "",
            website: typeof website === "string" ? website.trim() : "",
          },
          meetingSchedule:
            typeof meetingSchedule === "string" ? meetingSchedule.trim() : "",
          meetingLocation:
            typeof meetingLocation === "string" ? meetingLocation.trim() : "",
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await clubCollection.insertOne(newClub);

        return res.status(201).json({
          success: true,
          message: "Club created successfully",
          clubId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating club:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to create club",
        });
      }
    });

    // 4. Update Club
    app.patch("/api/clubs/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid club ID",
          });
        }

        const {
          name,
          shortDescription,
          description,
          logo,
          coverImage,
          category,
          foundedAt,
          mission,
          vision,
          email,
          socialLinks,
          meetingSchedule,
          meetingLocation,
          presidentId,
        } = req.body;

        const updateData = {};
        const isValidOptionalUrl = (value) => {
          if (!value) return true;
          try {
            const url = new URL(value);
            return ["http:", "https:"].includes(url.protocol);
          } catch {
            return false;
          }
        };

        if (name !== undefined) {
          if (typeof name !== "string" || !name.trim()) {
            return res
              .status(400)
              .json({ success: false, message: "Club name is required" });
          }
          const existingClub = await clubCollection.findOne({
            name: name.trim(),
            _id: { $ne: new ObjectId(id) },
          });
          if (existingClub) {
            return res
              .status(409)
              .json({ success: false, message: "Club already exists" });
          }
          updateData.name = name.trim();
        }
        if (shortDescription !== undefined) {
          if (
            typeof shortDescription !== "string" ||
            !shortDescription.trim()
          ) {
            return res.status(400).json({
              success: false,
              message: "Short description is required",
            });
          }
          if (shortDescription.trim().length > 200) {
            return res.status(400).json({
              success: false,
              message: "Short description must be 200 characters or fewer",
            });
          }
          updateData.shortDescription = shortDescription.trim();
        }
        if (description !== undefined) {
          if (typeof description !== "string") {
            return res
              .status(400)
              .json({ success: false, message: "Description must be text" });
          }
          updateData.description = description.trim();
        }
        if (logo !== undefined) {
          if (
            typeof logo !== "string" ||
            !logo.trim() ||
            !isValidOptionalUrl(logo)
          ) {
            return res.status(400).json({
              success: false,
              message: "A valid club logo URL is required",
            });
          }
          updateData.logo = logo.trim();
        }
        if (coverImage !== undefined) {
          if (
            typeof coverImage !== "string" ||
            !isValidOptionalUrl(coverImage)
          ) {
            return res.status(400).json({
              success: false,
              message: "Cover image must be a valid HTTP or HTTPS URL",
            });
          }
          updateData.coverImage = coverImage.trim();
        }
        if (category !== undefined) {
          if (
            typeof category !== "string" ||
            !category.trim() ||
            category.trim().length > 80
          ) {
            return res.status(400).json({
              success: false,
              message: "Choose a valid club category",
            });
          }
          updateData.category = category.trim();
        }
        if (foundedAt !== undefined) {
          const foundedDate = foundedAt ? new Date(foundedAt) : null;
          if (foundedAt && Number.isNaN(foundedDate.getTime())) {
            return res.status(400).json({
              success: false,
              message: "Founded date must be a valid date",
            });
          }
          updateData.foundedAt = foundedDate;
        }
        for (const [field, value] of Object.entries({
          mission,
          vision,
          meetingSchedule,
          meetingLocation,
        })) {
          if (value !== undefined) {
            if (typeof value !== "string") {
              return res
                .status(400)
                .json({ success: false, message: `${field} must be text` });
            }
            updateData[field] = value.trim();
          }
        }
        if (email !== undefined) {
          if (
            typeof email !== "string" ||
            (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
          ) {
            return res.status(400).json({
              success: false,
              message: "Enter a valid official email address",
            });
          }
          updateData.email = email.trim();
        }
        if (socialLinks !== undefined) {
          if (
            !socialLinks ||
            typeof socialLinks !== "object" ||
            Array.isArray(socialLinks)
          ) {
            return res.status(400).json({
              success: false,
              message: "Social links must be an object",
            });
          }
          const facebook = socialLinks.facebook ?? "";
          const website = socialLinks.website ?? "";
          if (
            typeof facebook !== "string" ||
            typeof website !== "string" ||
            !isValidOptionalUrl(facebook) ||
            !isValidOptionalUrl(website)
          ) {
            return res.status(400).json({
              success: false,
              message: "Facebook and website must be valid HTTP or HTTPS URLs",
            });
          }
          updateData.socialLinks = {
            facebook: facebook.trim(),
            website: website.trim(),
          };
        }
        if (presidentId !== undefined) updateData.presidentId = presidentId;

        if (Object.keys(updateData).length === 0) {
          return res.status(400).json({
            success: false,
            message: "No update data provided",
          });
        }

        updateData.updatedAt = new Date();

        const result = await clubCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Club not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Club updated successfully",
        });
      } catch (error) {
        console.error("Error updating club:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to update club",
        });
      }
    });

    // 5. Delete Club
    app.delete("/api/clubs/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid club ID",
          });
        }

        const result = await clubCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Club not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Club deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting club:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to delete club",
        });
      }
    });

    // 6. Update Club Status
    app.patch("/api/clubs/:id/status", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid club ID",
          });
        }

        if (!["active", "inactive"].includes(status)) {
          return res.status(400).json({
            success: false,
            message: "Status must be active or inactive",
          });
        }

        const result = await clubCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Club not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Club status updated successfully",
        });
      } catch (error) {
        console.error("Error updating club status:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to update club status",
        });
      }
    });

    // ===================================
    // USER MANAGEMENT ROUTES
    // ===================================

    const USER_ROLES = [
      "president",
      "pgpresident",
      "wbpresident",
      "user",
      "banuser",
    ];

    // Better Auth user ID filter
    const getUserFilter = (id) => {
      const filters = [{ id }];

      if (ObjectId.isValid(id)) {
        filters.push({ _id: new ObjectId(id) });
      }

      return { $or: filters };
    };

    // Safe user fields (exclude sensitive data)
    const userProjection = {
      id: 1,
      name: 1,
      email: 1,
      image: 1,
      role: 1,
      emailVerified: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    const authenticateUser = async (req, res, next) => {
      const cookie = req.get("cookie");

      if (!cookie) {
        return res.status(401).json({
          success: false,
          message: "Authentication is required.",
        });
      }

      try {
        const sessionResponse = await fetch(
          `${authBaseUrl}/api/auth/get-session`,
          {
            headers: {
              cookie,
              accept: "application/json",
            },
            cache: "no-store",
          },
        );

        if (!sessionResponse.ok) {
          return res.status(503).json({
            success: false,
            message: "Unable to verify your session.",
          });
        }

        const session = await sessionResponse.json();

        if (!session?.user) {
          return res.status(401).json({
            success: false,
            message: "A valid session is required.",
          });
        }

        req.authUser = session.user;
        return next();
      } catch (error) {
        console.error("Authentication error:", error);

        return res.status(503).json({
          success: false,
          message: "Authentication service unavailable.",
        });
      }
    };

    const normalizeClubIdentity = (club) =>
      [club?.name, club?.slug]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    const isClubFamily = (club, family) => {
      const identity = normalizeClubIdentity(club);
      if (family === "programming") {
        return identity.includes("programmingclub") || identity === "programming";
      }
      if (family === "web-development") {
        return (
          identity.includes("webdevelopmentclub") ||
          identity === "webdevelopment" ||
          identity.includes("webdevclub") ||
          identity === "webdev"
        );
      }
      return false;
    };

    const requireClubContentAccess = (family, presidentRole) => async (req, res, next) => {
      const userId = req.authUser?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "A valid user session is required.",
        });
      }

      try {
        const clubs = await clubCollection
          .find({}, { projection: { name: 1, slug: 1, presidentId: 1 } })
          .toArray();
        const club = clubs.find((candidate) => isClubFamily(candidate, family));

        if (!club) {
          return res.status(404).json({
            success: false,
            message: "This club is not available.",
          });
        }

        const hasManagementAccess =
          req.authUser.role === "president" ||
          req.authUser.role === presidentRole ||
          String(club.presidentId || "") === String(userId);
        if (hasManagementAccess) {
          req.contentClub = club;
          return next();
        }

        const membership = await membershipCollection.findOne({
          userId,
          clubId: club._id,
          status: "active",
        });
        if (!membership) {
          return res.status(403).json({
            success: false,
            message: "An active membership in this club is required to view its content.",
          });
        }

        req.contentClub = club;
        return next();
      } catch (error) {
        console.error("Club content authorization error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to verify club membership.",
        });
      }
    };

    // Keep self-service join-request reads available to authenticated users.
    // Single-user reads perform their own scoped authorization below.
    // All other user-management endpoints remain president-only.
    app.use("/api/users", (req, res, next) => {
      const isJoinRequestRead =
        req.method === "GET" && req.path === "/me/join-requests";
      const isOwnProfileRequest =
        ["GET", "PATCH"].includes(req.method) && req.path === "/me/profile";
      const isOwnClubsRequest =
        req.method === "GET" && req.path === "/me/clubs";
      const isSingleUserRead =
        req.method === "GET" &&
        req.path !== "/stats" &&
        /^\/[^/]+\/?$/.test(req.path);

      if (
        isJoinRequestRead ||
        isOwnProfileRequest ||
        isOwnClubsRequest ||
        isSingleUserRead
      ) {
        return next();
      }

      return requireRole("president")(req, res, next);
    });

    const profileProjection = {
      id: 1,
      name: 1,
      email: 1,
      image: 1,
      role: 1,
      createdAt: 1,
      updatedAt: 1,
      phoneNumber: 1,
      university: 1,
      department: 1,
      studentId: 1,
      academicSession: 1,
      bio: 1,
      github: 1,
      linkedin: 1,
      portfolio: 1,
    };
    const editableProfileFieldLimits = {
      phoneNumber: 40,
      university: 120,
      department: 120,
      studentId: 60,
      academicSession: 60,
      bio: 500,
      github: 2048,
      linkedin: 2048,
      portfolio: 2048,
    };
    const isHttpUrlOrEmpty = (value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol);
      } catch {
        return false;
      }
    };

    app.get("/api/users/me/clubs", authenticateUser, async (req, res) => {
      try {
        const userId = req.authUser?.id;
        if (!userId) {
          return res.status(401).json({
            success: false,
            message: "A valid user session is required.",
          });
        }

        const memberships = await membershipCollection
          .find({ userId, status: "active" })
          .sort({ joinedAt: -1 })
          .toArray();
        if (memberships.length === 0) {
          return res.status(200).json({
            success: true,
            data: [],
          });
        }

        const clubs = await clubCollection
          .find(
            { _id: { $in: memberships.map((membership) => membership.clubId) } },
            {
              projection: {
                name: 1,
                slug: 1,
                shortDescription: 1,
                description: 1,
                logo: 1,
                coverImage: 1,
                category: 1,
                status: 1,
              },
            },
          )
          .toArray();
        const clubsById = new Map(
          clubs.map((club) => [String(club._id), club]),
        );
        const data = memberships.flatMap((membership) => {
          const club = clubsById.get(String(membership.clubId));
          if (!club) return [];

          return [{
            membershipId: String(membership._id),
            clubId: String(membership.clubId),
            club: {
              ...club,
              _id: String(club._id),
            },
            status: membership.status,
            joinedAt: membership.joinedAt || null,
          }];
        });

        return res.status(200).json({ success: true, data });
      } catch (error) {
        console.error("Get my clubs error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch your active clubs.",
        });
      }
    });

    app.get("/api/users/me/profile", authenticateUser, async (req, res) => {
      try {
        const userId = req.authUser?.id;
        if (!userId) {
          return res.status(401).json({
            success: false,
            message: "A valid user session is required.",
          });
        }

        const user = await userCollection.findOne(getUserFilter(userId), {
          projection: profileProjection,
        });
        if (!user) {
          return res.status(404).json({
            success: false,
            message: "Your profile could not be found.",
          });
        }

        return res.status(200).json({ success: true, user });
      } catch (error) {
        console.error("Error fetching own profile:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch your profile.",
        });
      }
    });

    app.patch("/api/users/me/profile", authenticateUser, async (req, res) => {
      try {
        const userId = req.authUser?.id;
        if (!userId) {
          return res.status(401).json({
            success: false,
            message: "A valid user session is required.",
          });
        }

        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
          return res.status(400).json({
            success: false,
            message: "Profile updates must be a JSON object.",
          });
        }

        const allowedFields = new Set([
          "name",
          "image",
          ...Object.keys(editableProfileFieldLimits),
        ]);
        const unexpectedFields = Object.keys(req.body).filter(
          (field) => !allowedFields.has(field),
        );
        if (unexpectedFields.length > 0) {
          return res.status(400).json({
            success: false,
            message: "One or more profile fields cannot be edited.",
          });
        }

        const updateData = {};
        if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
          if (
            typeof req.body.name !== "string" ||
            !req.body.name.trim() ||
            req.body.name.trim().length > 100
          ) {
            return res.status(400).json({
              success: false,
              message: "Name is required and must be 100 characters or fewer.",
            });
          }
          updateData.name = req.body.name.trim();
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "image")) {
          if (
            typeof req.body.image !== "string" ||
            !isHttpUrlOrEmpty(req.body.image.trim())
          ) {
            return res.status(400).json({
              success: false,
              message: "Profile image must be an HTTP or HTTPS URL.",
            });
          }
          updateData.image = req.body.image.trim();
        }

        for (const [field, maximumLength] of Object.entries(editableProfileFieldLimits)) {
          if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;
          const value = req.body[field];
          if (typeof value !== "string" || value.trim().length > maximumLength) {
            return res.status(400).json({
              success: false,
              message: `${field} must be text with at most ${maximumLength} characters.`,
            });
          }
          if (
            ["github", "linkedin", "portfolio"].includes(field) &&
            !isHttpUrlOrEmpty(value.trim())
          ) {
            return res.status(400).json({
              success: false,
              message: `${field} must be a valid HTTP or HTTPS URL.`,
            });
          }
          updateData[field] = value.trim();
        }

        if (Object.keys(updateData).length === 0) {
          return res.status(400).json({
            success: false,
            message: "No editable profile fields were provided.",
          });
        }

        updateData.updatedAt = new Date();
        const result = await userCollection.updateOne(getUserFilter(userId), {
          $set: updateData,
        });
        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Your profile could not be found.",
          });
        }

        const user = await userCollection.findOne(getUserFilter(userId), {
          projection: profileProjection,
        });
        return res.status(200).json({
          success: true,
          message: "Profile updated successfully.",
          user,
        });
      } catch (error) {
        console.error("Error updating own profile:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to update your profile.",
        });
      }
    });

    // 1. Get All Users
    // Supports search, role filter and pagination

    app.get("/api/users", async (req, res) => {
      try {
        const { search = "", role = "", page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, parseInt(page) || 1);
        const perPage = Math.min(100, Math.max(1, parseInt(limit) || 10));

        const filter = {};

        if (role && role !== "all") {
          if (!USER_ROLES.includes(role)) {
            return res.status(400).json({
              success: false,
              message: "Invalid user role",
            });
          }

          filter.role = role;
        }

        if (search.trim()) {
          const safeSearch = search
            .trim()
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

          filter.$or = [
            { name: { $regex: safeSearch, $options: "i" } },
            { email: { $regex: safeSearch, $options: "i" } },
          ];
        }

        const [users, totalUsers] = await Promise.all([
          userCollection
            .find(filter, { projection: userProjection })
            .sort({ createdAt: -1 })
            .skip((currentPage - 1) * perPage)
            .limit(perPage)
            .toArray(),

          userCollection.countDocuments(filter),
        ]);

        return res.status(200).json({
          success: true,
          totalUsers,
          currentPage,
          totalPages: Math.ceil(totalUsers / perPage),
          users,
        });
      } catch (error) {
        console.error("Error fetching users:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch users",
        });
      }
    });

    // Keep this fixed route ahead of /:id so "stats" is not treated as a user ID.
    app.get("/api/users/stats", async (req, res) => {
      try {
        const [totalUsers, roleStats] = await Promise.all([
          userCollection.countDocuments(),
          userCollection
            .aggregate([
              {
                $group: {
                  _id: { $ifNull: ["$role", "user"] },
                  count: { $sum: 1 },
                },
              },
            ])
            .toArray(),
        ]);

        const statistics = {
          totalUsers,
          president: 0,
          pgpresident: 0,
          wbpresident: 0,
          user: 0,
          banuser: 0,
        };

        roleStats.forEach((item) => {
          if (USER_ROLES.includes(item._id)) {
            statistics[item._id] = item.count;
          }
        });

        return res.status(200).json({
          success: true,
          statistics,
        });
      } catch (error) {
        console.error("Error fetching user statistics:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch user statistics",
        });
      }
    });

    // 2. Get Single User

    app.get("/api/users/:id", authenticateUser, async (req, res) => {
      try {
        const { id } = req.params;

        if (req.authUser.role !== "president") {
          const roleClubMatchers = {
            pgpresident: (identity) =>
              identity.includes("programmingclub") || identity === "programming",
            wbpresident: (identity) =>
              identity.includes("webdevelopmentclub") ||
              identity === "webdevelopment",
          };
          const matchesRoleClub = roleClubMatchers[req.authUser.role];

          if (!matchesRoleClub) {
            return res.status(403).json({
              success: false,
              message: "You are not authorized to view this user.",
            });
          }

          const clubs = await clubCollection.find().toArray();
          const managedClubIds = clubs
            .filter((club) => {
              const identity = [club.name, club.slug]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "");
              return matchesRoleClub(identity);
            })
            .map((club) => club._id);

          if (managedClubIds.length === 0) {
            return res.status(403).json({
              success: false,
              message: "You are not authorized to view this user.",
            });
          }

          const [activeMembership, pendingRequest] = await Promise.all([
            membershipCollection.findOne({
              userId: id,
              clubId: { $in: managedClubIds },
              status: "active",
            }),
            joinRequestCollection.findOne({
              userId: id,
              clubId: { $in: managedClubIds },
              status: "pending",
            }),
          ]);

          if (!activeMembership && !pendingRequest) {
            return res.status(403).json({
              success: false,
              message: "You are not authorized to view this user.",
            });
          }
        }

        const user = await userCollection.findOne(getUserFilter(id), {
          projection: userProjection,
        });

        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        return res.status(200).json({
          success: true,
          user,
        });
      } catch (error) {
        console.error("Error fetching user:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch user",
        });
      }
    });

    // 3. Update User Information
    // Name and Profile Picture

    app.patch("/api/users/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { name, image } = req.body;

        const updateData = {};

        if (name !== undefined) {
          if (typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
              success: false,
              message: "Valid name is required",
            });
          }

          updateData.name = name.trim();
        }

        if (image !== undefined) {
          if (image !== null && typeof image !== "string") {
            return res.status(400).json({
              success: false,
              message: "Invalid profile image",
            });
          }

          updateData.image = image;
        }

        if (Object.keys(updateData).length === 0) {
          return res.status(400).json({
            success: false,
            message: "No update data provided",
          });
        }

        updateData.updatedAt = new Date();

        const result = await userCollection.updateOne(getUserFilter(id), {
          $set: updateData,
        });

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "User updated successfully",
        });
      } catch (error) {
        console.error("Error updating user:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to update user",
        });
      }
    });

    // 4. Update User Role

    app.patch("/api/users/:id/role", async (req, res) => {
      try {
        const { id } = req.params;
        const { role } = req.body;

        if (!USER_ROLES.includes(role)) {
          return res.status(400).json({
            success: false,
            message: "Invalid role",
            allowedRoles: USER_ROLES,
          });
        }

        const result = await userCollection.updateOne(getUserFilter(id), {
          $set: {
            role,
            updatedAt: new Date(),
          },
        });

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "User role updated successfully",
          role,
        });
      } catch (error) {
        console.error("Error updating user role:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to update user role",
        });
      }
    });

    // 5. Ban User
    // Ban means assigning banuser role

    app.patch("/api/users/:id/ban", async (req, res) => {
      try {
        const { id } = req.params;

        const result = await userCollection.updateOne(getUserFilter(id), {
          $set: {
            role: "banuser",
            updatedAt: new Date(),
          },
        });

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "User banned successfully",
        });
      } catch (error) {
        console.error("Error banning user:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to ban user",
        });
      }
    });

    // 6. Unban User
    // Restores role to normal user

    app.patch("/api/users/:id/unban", async (req, res) => {
      try {
        const { id } = req.params;

        const result = await userCollection.updateOne(
          {
            $and: [getUserFilter(id), { role: "banuser" }],
          },
          {
            $set: {
              role: "user",
              updatedAt: new Date(),
            },
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Banned user not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "User unbanned successfully",
        });
      } catch (error) {
        console.error("Error unbanning user:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to unban user",
        });
      }
    });

    // 7. Delete User

    app.delete("/api/users/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const result = await userCollection.deleteOne(getUserFilter(id));

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "User deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting user:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to delete user",
        });
      }
    });

    // ===================================
    // PROGRAMMING CLUB - CONTEST & RESOURCE
    // ===================================

    // Validate and prepare request body
    function validateContent(data) {
      const title = typeof data.title === "string" ? data.title.trim() : "";
      const description =
        typeof data.description === "string" ? data.description.trim() : "";
      const link = typeof data.link === "string" ? data.link.trim() : "";

      if (!title || !description || !link) {
        return {
          error: "Title, description and link are required.",
        };
      }

      try {
        const parsedUrl = new URL(link);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw new Error("Invalid protocol");
        }
      } catch {
        return {
          error: "Please provide a valid HTTP or HTTPS link.",
        };
      }

      return {
        data: {
          title,
          description,
          link,
        },
      };
    }

    // ===================================
    // 1. CONTEST MANAGEMENT
    // ===================================

    // GET: Get All Contests
    app.get("/api/programming/contests", authenticateUser, requireClubContentAccess("programming", "pgpresident"), async (req, res) => {
      try {
        const contests = await contestCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json({
          success: true,
          message: "Contests fetched successfully.",
          data: contests,
        });
      } catch (error) {
        console.error("Get contests error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch contests.",
        });
      }
    });

    // GET: Get Single Contest
    app.get("/api/programming/contests/:id", authenticateUser, requireClubContentAccess("programming", "pgpresident"), async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid contest ID.",
          });
        }

        const contest = await contestCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!contest) {
          return res.status(404).json({
            success: false,
            message: "Contest not found.",
          });
        }

        res.status(200).json({
          success: true,
          data: contest,
        });
      } catch (error) {
        console.error("Get single contest error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch contest.",
        });
      }
    });

    // POST: Create Contest
    app.post(
      "/api/programming/contests",
      requireRole("pgpresident"),
      async (req, res) => {
        try {
          const validation = validateContent(req.body);

          if (validation.error) {
            return res.status(400).json({
              success: false,
              message: validation.error,
            });
          }

          const newContest = {
            ...validation.data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const result = await contestCollection.insertOne(newContest);

          res.status(201).json({
            success: true,
            message: "Contest created successfully.",
            data: {
              _id: result.insertedId,
              ...newContest,
            },
          });
        } catch (error) {
          console.error("Create contest error:", error);
          res.status(500).json({
            success: false,
            message: "Failed to create contest.",
          });
        }
      },
    );

    // PATCH: Update Contest
    app.patch(
      "/api/programming/contests/:id",
      requireRole("pgpresident"),
      async (req, res) => {
        try {
          const { id } = req.params;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message: "Invalid contest ID.",
            });
          }

          const validation = validateContent(req.body);

          if (validation.error) {
            return res.status(400).json({
              success: false,
              message: validation.error,
            });
          }

          const result = await contestCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                ...validation.data,
                updatedAt: new Date(),
              },
            },
          );

          if (result.matchedCount === 0) {
            return res.status(404).json({
              success: false,
              message: "Contest not found.",
            });
          }

          res.status(200).json({
            success: true,
            message: "Contest updated successfully.",
          });
        } catch (error) {
          console.error("Update contest error:", error);
          res.status(500).json({
            success: false,
            message: "Failed to update contest.",
          });
        }
      },
    );

    // DELETE: Delete Contest
    app.delete(
      "/api/programming/contests/:id",
      requireRole("pgpresident"),
      async (req, res) => {
        try {
          const { id } = req.params;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message: "Invalid contest ID.",
            });
          }

          const result = await contestCollection.deleteOne({
            _id: new ObjectId(id),
          });

          if (result.deletedCount === 0) {
            return res.status(404).json({
              success: false,
              message: "Contest not found.",
            });
          }

          res.status(200).json({
            success: true,
            message: "Contest deleted successfully.",
          });
        } catch (error) {
          console.error("Delete contest error:", error);
          res.status(500).json({
            success: false,
            message: "Failed to delete contest.",
          });
        }
      },
    );

    // ===================================
    // 2. RESOURCE MANAGEMENT
    // ===================================

    // GET: Get All Resources
    app.get("/api/programming/resources", authenticateUser, requireClubContentAccess("programming", "pgpresident"), async (req, res) => {
      try {
        const resources = await resourceCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json({
          success: true,
          message: "Resources fetched successfully.",
          data: resources,
        });
      } catch (error) {
        console.error("Get resources error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch resources.",
        });
      }
    });

    // GET: Get Single Resource
    app.get("/api/programming/resources/:id", authenticateUser, requireClubContentAccess("programming", "pgpresident"), async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid resource ID.",
          });
        }

        const resource = await resourceCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!resource) {
          return res.status(404).json({
            success: false,
            message: "Resource not found.",
          });
        }

        res.status(200).json({
          success: true,
          data: resource,
        });
      } catch (error) {
        console.error("Get single resource error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch resource.",
        });
      }
    });

    // POST: Create Resource
    app.post(
      "/api/programming/resources",
      requireRole("pgpresident"),
      async (req, res) => {
        try {
          const validation = validateContent(req.body);

          if (validation.error) {
            return res.status(400).json({
              success: false,
              message: validation.error,
            });
          }

          const newResource = {
            ...validation.data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const result = await resourceCollection.insertOne(newResource);

          res.status(201).json({
            success: true,
            message: "Resource created successfully.",
            data: {
              _id: result.insertedId,
              ...newResource,
            },
          });
        } catch (error) {
          console.error("Create resource error:", error);
          res.status(500).json({
            success: false,
            message: "Failed to create resource.",
          });
        }
      },
    );

    // PATCH: Update Resource
    app.patch(
      "/api/programming/resources/:id",
      requireRole("pgpresident"),
      async (req, res) => {
        try {
          const { id } = req.params;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message: "Invalid resource ID.",
            });
          }

          const validation = validateContent(req.body);

          if (validation.error) {
            return res.status(400).json({
              success: false,
              message: validation.error,
            });
          }

          const result = await resourceCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                ...validation.data,
                updatedAt: new Date(),
              },
            },
          );

          if (result.matchedCount === 0) {
            return res.status(404).json({
              success: false,
              message: "Resource not found.",
            });
          }

          res.status(200).json({
            success: true,
            message: "Resource updated successfully.",
          });
        } catch (error) {
          console.error("Update resource error:", error);
          res.status(500).json({
            success: false,
            message: "Failed to update resource.",
          });
        }
      },
    );

    // DELETE: Delete Resource
    app.delete(
      "/api/programming/resources/:id",
      requireRole("pgpresident"),
      async (req, res) => {
        try {
          const { id } = req.params;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message: "Invalid resource ID.",
            });
          }

          const result = await resourceCollection.deleteOne({
            _id: new ObjectId(id),
          });

          if (result.deletedCount === 0) {
            return res.status(404).json({
              success: false,
              message: "Resource not found.",
            });
          }

          res.status(200).json({
            success: true,
            message: "Resource deleted successfully.",
          });
        } catch (error) {
          console.error("Delete resource error:", error);
          res.status(500).json({
            success: false,
            message: "Failed to delete resource.",
          });
        }
      },
    );

    // ===========================================
    // WEB DEVELOPMENT CLUB
    // HACKATHON & RESOURCE MANAGEMENT
    // ===========================================

    // -------------------------------------------
    // COMMON VALIDATION HELPERS
    // -------------------------------------------

    const isValidHttpUrl = (value) => {
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol);
      } catch {
        return false;
      }
    };

    const isValidDate = (value) => {
      return value && !Number.isNaN(new Date(value).getTime());
    };

    const isValidObjectId = (id) => ObjectId.isValid(id);

    // ===========================================
    // 1. WEB DEVELOPMENT HACKATHON MANAGEMENT
    // ===========================================

    // Validate Hackathon Data
    function validateHackathon(data) {
      const {
        title,
        shortDescription,
        fullDescription,
        bannerImage,
        theme,
        contactEmail,
        registration,
        timeline,
        mode,
        venue,
        prizes,
        judgingCriteria,
        rules,
      } = data;

      if (
        !title?.trim() ||
        !shortDescription?.trim() ||
        !fullDescription?.trim() ||
        !theme?.trim()
      ) {
        return { error: "Title, descriptions and theme are required." };
      }

      if (!registration || !timeline) {
        return { error: "Registration and timeline information are required." };
      }

      if (!isValidHttpUrl(registration.link)) {
        return { error: "Invalid registration link." };
      }

      if (!isValidDate(registration.deadline)) {
        return { error: "Valid registration deadline is required." };
      }

      if (!isValidDate(timeline.startDate) || !isValidDate(timeline.endDate)) {
        return { error: "Valid hackathon start and end dates are required." };
      }

      if (new Date(timeline.endDate) < new Date(timeline.startDate)) {
        return { error: "End date cannot be before start date." };
      }

      if (
        !Number.isInteger(registration.minTeamSize) ||
        !Number.isInteger(registration.maxTeamSize) ||
        registration.minTeamSize < 1 ||
        registration.maxTeamSize < registration.minTeamSize
      ) {
        return { error: "Invalid team size." };
      }

      if (!["online", "offline", "hybrid"].includes(mode)) {
        return { error: "Invalid hackathon mode." };
      }

      if (
        registration.fee !== undefined &&
        (!Number.isFinite(registration.fee) || registration.fee < 0)
      ) {
        return { error: "Registration fee must be a non-negative number." };
      }

      if (
        registration.maxParticipants !== undefined &&
        (!Number.isInteger(registration.maxParticipants) ||
          registration.maxParticipants < 1)
      ) {
        return { error: "Invalid maximum participants." };
      }

      if (bannerImage && !isValidHttpUrl(bannerImage)) {
        return { error: "Invalid banner image URL." };
      }

      if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        return { error: "Invalid contact email." };
      }

      const validPrizes = prizes ?? [];
      const validCriteria = judgingCriteria ?? [];
      const validRules = rules ?? [];

      if (
        !Array.isArray(validPrizes) ||
        !Array.isArray(validCriteria) ||
        !Array.isArray(validRules)
      ) {
        return { error: "Prizes, judging criteria and rules must be arrays." };
      }

      for (const prize of validPrizes) {
        if (!prize.position?.trim() || !prize.title?.trim()) {
          return { error: "Each prize requires a position and title." };
        }
      }

      for (const criteria of validCriteria) {
        if (
          !criteria.name?.trim() ||
          !Number.isFinite(criteria.weight) ||
          criteria.weight < 0
        ) {
          return { error: "Invalid judging criteria." };
        }
      }

      const totalWeight = validCriteria.reduce(
        (sum, item) => sum + item.weight,
        0,
      );

      if (validCriteria.length > 0 && Math.abs(totalWeight - 100) > 0.001) {
        return { error: "Judging criteria weights must total 100%." };
      }

      if (
        !validRules.every((rule) => typeof rule === "string" && rule.trim())
      ) {
        return { error: "Every rule must be a non-empty string." };
      }

      return {
        data: {
          title: title.trim(),
          shortDescription: shortDescription.trim(),
          fullDescription: fullDescription.trim(),
          bannerImage: bannerImage?.trim() || "",
          theme: theme.trim(),
          contactEmail: contactEmail?.trim() || "",
          registration: {
            link: registration.link.trim(),
            deadline: new Date(registration.deadline),
            fee: registration.fee ?? 0,
            eligibility: registration.eligibility?.trim() || "",
            minTeamSize: registration.minTeamSize,
            maxTeamSize: registration.maxTeamSize,
            maxParticipants: registration.maxParticipants ?? null,
            status: ["open", "closed", "upcoming"].includes(registration.status)
              ? registration.status
              : "upcoming",
          },
          timeline: {
            startDate: new Date(timeline.startDate),
            endDate: new Date(timeline.endDate),
            ideaSubmissionDeadline: isValidDate(timeline.ideaSubmissionDeadline)
              ? new Date(timeline.ideaSubmissionDeadline)
              : null,
            finalSubmissionDeadline: isValidDate(
              timeline.finalSubmissionDeadline,
            )
              ? new Date(timeline.finalSubmissionDeadline)
              : null,
            judgingDate: isValidDate(timeline.judgingDate)
              ? new Date(timeline.judgingDate)
              : null,
            resultDate: isValidDate(timeline.resultDate)
              ? new Date(timeline.resultDate)
              : null,
          },
          mode,
          venue: venue?.trim() || "",
          prizes: validPrizes.map((prize) => ({
            position: prize.position.trim(),
            title: prize.title.trim(),
            description: prize.description?.trim() || "",
          })),
          judgingCriteria: validCriteria.map((item) => ({
            name: item.name.trim(),
            weight: item.weight,
          })),
          rules: validRules.map((rule) => rule.trim()),
        },
      };
    }

    // -------------------------------------------
    // GET: ALL HACKATHONS
    // -------------------------------------------

    app.get("/api/web-development/hackathons", authenticateUser, requireClubContentAccess("web-development", "wbpresident"), async (req, res) => {
      try {
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(
          50,
          Math.max(1, Number.parseInt(req.query.limit, 10) || 10),
        );

        const search = req.query.search?.trim() || "";

        const filter = search
          ? {
              $or: [
                { title: { $regex: search, $options: "i" } },
                { shortDescription: { $regex: search, $options: "i" } },
                { theme: { $regex: search, $options: "i" } },
              ],
            }
          : {};

        const total = await webHackathonCollection.countDocuments(filter);

        const hackathons = await webHackathonCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray();

        res.status(200).json({
          success: true,
          message: "Hackathons fetched successfully.",
          data: hackathons,
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        console.error("Get hackathons error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch hackathons.",
        });
      }
    });

    // -------------------------------------------
    // GET: SINGLE HACKATHON
    // -------------------------------------------

    app.get("/api/web-development/hackathons/:id", authenticateUser, requireClubContentAccess("web-development", "wbpresident"), async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid hackathon ID.",
          });
        }

        const hackathon = await webHackathonCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!hackathon) {
          return res.status(404).json({
            success: false,
            message: "Hackathon not found.",
          });
        }

        res.status(200).json({
          success: true,
          data: hackathon,
        });
      } catch (error) {
        console.error("Get hackathon error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch hackathon.",
        });
      }
    });

    // -------------------------------------------
    // POST: CREATE HACKATHON
    // -------------------------------------------

    app.post("/api/web-development/hackathons", requireRole("wbpresident"), async (req, res) => {
      try {
        const validation = validateHackathon(req.body);

        if (validation.error) {
          return res.status(400).json({
            success: false,
            message: validation.error,
          });
        }

        const newHackathon = {
          ...validation.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await webHackathonCollection.insertOne(newHackathon);

        res.status(201).json({
          success: true,
          message: "Hackathon created successfully.",
          data: {
            _id: result.insertedId,
            ...newHackathon,
          },
        });
      } catch (error) {
        console.error("Create hackathon error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to create hackathon.",
        });
      }
    });

    // -------------------------------------------
    // PATCH: UPDATE HACKATHON
    // -------------------------------------------

    app.patch("/api/web-development/hackathons/:id", requireRole("wbpresident"), async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid hackathon ID.",
          });
        }

        const existing = await webHackathonCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!existing) {
          return res.status(404).json({
            success: false,
            message: "Hackathon not found.",
          });
        }

        const mergedData = {
          ...existing,
          ...req.body,
          registration: {
            ...existing.registration,
            ...req.body.registration,
          },
          timeline: {
            ...existing.timeline,
            ...req.body.timeline,
          },
        };

        const validation = validateHackathon(mergedData);

        if (validation.error) {
          return res.status(400).json({
            success: false,
            message: validation.error,
          });
        }

        await webHackathonCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              ...validation.data,
              updatedAt: new Date(),
            },
          },
        );

        res.status(200).json({
          success: true,
          message: "Hackathon updated successfully.",
        });
      } catch (error) {
        console.error("Update hackathon error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update hackathon.",
        });
      }
    });

    // -------------------------------------------
    // DELETE: HACKATHON
    // -------------------------------------------

    app.delete("/api/web-development/hackathons/:id", requireRole("wbpresident"), async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid hackathon ID.",
          });
        }

        const result = await webHackathonCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Hackathon not found.",
          });
        }

        res.status(200).json({
          success: true,
          message: "Hackathon deleted successfully.",
        });
      } catch (error) {
        console.error("Delete hackathon error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete hackathon.",
        });
      }
    });

    // ===========================================
    // 2. WEB DEVELOPMENT RESOURCE MANAGEMENT
    // ===========================================

    // Validate Resource Data
    function validateWebResource(data) {
      const title = typeof data.title === "string" ? data.title.trim() : "";

      const description =
        typeof data.description === "string" ? data.description.trim() : "";

      const link = typeof data.link === "string" ? data.link.trim() : "";

      const category =
        typeof data.category === "string" ? data.category.trim() : "";

      if (!title || !description || !link || !category) {
        return {
          error: "Title, description, link and category are required.",
        };
      }

      if (!isValidHttpUrl(link)) {
        return {
          error: "Please provide a valid HTTP or HTTPS link.",
        };
      }

      return {
        data: {
          title,
          description,
          link,
          category,
        },
      };
    }

    // -------------------------------------------
    // GET: ALL WEB RESOURCES
    // -------------------------------------------

    app.get("/api/web-development/resources", authenticateUser, requireClubContentAccess("web-development", "wbpresident"), async (req, res) => {
      try {
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(
          50,
          Math.max(1, Number.parseInt(req.query.limit, 10) || 10),
        );

        const search = req.query.search?.trim() || "";
        const category = req.query.category?.trim() || "";

        const filter = {};

        if (search) {
          filter.$or = [
            { title: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ];
        }

        if (category) {
          filter.category = category;
        }

        const total = await webResourceCollection.countDocuments(filter);

        const resources = await webResourceCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray();

        res.status(200).json({
          success: true,
          message: "Resources fetched successfully.",
          data: resources,
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        console.error("Get web resources error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch resources.",
        });
      }
    });

    // -------------------------------------------
    // GET: SINGLE WEB RESOURCE
    // -------------------------------------------

    app.get("/api/web-development/resources/:id", authenticateUser, requireClubContentAccess("web-development", "wbpresident"), async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid resource ID.",
          });
        }

        const resource = await webResourceCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!resource) {
          return res.status(404).json({
            success: false,
            message: "Resource not found.",
          });
        }

        res.status(200).json({
          success: true,
          data: resource,
        });
      } catch (error) {
        console.error("Get web resource error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch resource.",
        });
      }
    });

    // -------------------------------------------
    // POST: CREATE WEB RESOURCE
    // -------------------------------------------

    app.post("/api/web-development/resources", requireRole("wbpresident"), async (req, res) => {
      try {
        const validation = validateWebResource(req.body);

        if (validation.error) {
          return res.status(400).json({
            success: false,
            message: validation.error,
          });
        }

        const newResource = {
          ...validation.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await webResourceCollection.insertOne(newResource);

        res.status(201).json({
          success: true,
          message: "Resource created successfully.",
          data: {
            _id: result.insertedId,
            ...newResource,
          },
        });
      } catch (error) {
        console.error("Create web resource error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to create resource.",
        });
      }
    });

    // -------------------------------------------
    // PATCH: UPDATE WEB RESOURCE
    // -------------------------------------------

    app.patch("/api/web-development/resources/:id", requireRole("wbpresident"), async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid resource ID.",
          });
        }

        const existing = await webResourceCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!existing) {
          return res.status(404).json({
            success: false,
            message: "Resource not found.",
          });
        }

        const mergedData = {
          title: req.body.title ?? existing.title,
          description: req.body.description ?? existing.description,
          link: req.body.link ?? existing.link,
          category: req.body.category ?? existing.category,
        };

        const validation = validateWebResource(mergedData);

        if (validation.error) {
          return res.status(400).json({
            success: false,
            message: validation.error,
          });
        }

        await webResourceCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              ...validation.data,
              updatedAt: new Date(),
            },
          },
        );

        res.status(200).json({
          success: true,
          message: "Resource updated successfully.",
        });
      } catch (error) {
        console.error("Update web resource error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update resource.",
        });
      }
    });

    // -------------------------------------------
    // DELETE: WEB RESOURCE
    // -------------------------------------------

    app.delete("/api/web-development/resources/:id", requireRole("wbpresident"), async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid resource ID.",
          });
        }

        const result = await webResourceCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Resource not found.",
          });
        }

        res.status(200).json({
          success: true,
          message: "Resource deleted successfully.",
        });
      } catch (error) {
        console.error("Delete web resource error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete resource.",
        });
      }
    });
    


// ===================================
// CLUB MEMBERSHIP MANAGEMENT
// ===================================

// ===================================
// 0. AUTHENTICATION & AUTHORIZATION
// ===================================

// Verify logged-in user using Better Auth
// Check whether logged-in user can manage a particular club
const requireClubPresident = async (req, res, next) => {
  try {
    const { clubId } = req.params;

    if (!ObjectId.isValid(clubId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid club ID.",
      });
    }

    const club = await clubCollection.findOne({
      _id: new ObjectId(clubId),
    });

    if (!club) {
      return res.status(404).json({
        success: false,
        message: "Club not found.",
      });
    }

    const { id, role } = req.authUser;

    // Main president can manage every club
    if (role === "president") {
      req.managedClub = club;
      return next();
    }

    // Dynamic club president assignment
    if (
      club.presidentId &&
      String(club.presidentId) === String(id)
    ) {
      req.managedClub = club;
      return next();
    }

    // Normalize club name and slug
    const clubIdentity = [
      club.name,
      club.slug,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    // Programming Club President
    if (
      role === "pgpresident" &&
      (
        clubIdentity.includes("programmingclub") ||
        clubIdentity === "programming"
      )
    ) {
      req.managedClub = club;
      return next();
    }

    // Web Development Club President
    if (
      role === "wbpresident" &&
      (
        clubIdentity.includes("webdevelopmentclub") ||
        clubIdentity === "webdevelopment"
      )
    ) {
      req.managedClub = club;
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "You are not authorized to manage this club.",
    });

  } catch (error) {
    console.error("Club authorization error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify club permissions.",
    });
  }
};


// ===================================
// DATABASE INDEXES
// ===================================

// Prevent duplicate active memberships
await membershipCollection.createIndex(
  {
    userId: 1,
    clubId: 1,
  },
  {
    unique: true,
  }
);

// Prevent duplicate pending join requests
await joinRequestCollection.createIndex(
  {
    userId: 1,
    clubId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      status: "pending",
    },
  }
);


// ===================================
// 1. SEND CLUB JOIN REQUEST
// POST: /api/clubs/:clubId/join
// ===================================

app.post(
  "/api/clubs/:clubId/join",
  authenticateUser,
  async (req, res) => {
    try {
      const { clubId } = req.params;
      const { message = "" } = req.body;

      const user = req.authUser;

      if (user.role === "banuser") {
        return res.status(403).json({
          success: false,
          message: "Your account is restricted.",
        });
      }

      if (user.role !== "user") {
        return res.status(403).json({
          success: false,
          message: "Only regular users can request membership.",
        });
      }

      if (!ObjectId.isValid(clubId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid club ID.",
        });
      }

      if (
        typeof message !== "string" ||
        message.length > 1000
      ) {
        return res.status(400).json({
          success: false,
          message: "Message must be a string with at most 1000 characters.",
        });
      }

      const club = await clubCollection.findOne({
        _id: new ObjectId(clubId),
      });

      if (!club) {
        return res.status(404).json({
          success: false,
          message: "Club not found.",
        });
      }

      // Check existing active membership
      const existingMember = await membershipCollection.findOne({
        userId: user.id,
        clubId: new ObjectId(clubId),
        status: "active",
      });

      if (existingMember) {
        return res.status(409).json({
          success: false,
          message: "You are already a member of this club.",
        });
      }

      // Check existing pending request
      const existingRequest = await joinRequestCollection.findOne({
        userId: user.id,
        clubId: new ObjectId(clubId),
        status: "pending",
      });

      if (existingRequest) {
        return res.status(409).json({
          success: false,
          message: "You already have a pending request.",
        });
      }

      const newRequest = {
        userId: user.id,
        clubId: new ObjectId(clubId),
        message: message.trim(),
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
        reviewedBy: null,
        reviewedAt: null,
      };

      const result = await joinRequestCollection.insertOne(
        newRequest
      );

      res.status(201).json({
        success: true,
        message: "Club join request submitted successfully.",
        data: {
          _id: result.insertedId,
          ...newRequest,
        },
      });

    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "You already have a pending request.",
        });
      }

      console.error("Send join request error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to submit join request.",
      });
    }
  }
);


// ===================================
// 2. GET MY JOIN REQUESTS
// GET: /api/users/me/join-requests
// ===================================

app.get(
  "/api/users/me/join-requests",
  authenticateUser,
  async (req, res) => {
    try {
      const requests = await joinRequestCollection
        .find({
          userId: req.authUser.id,
        })
        .sort({ createdAt: -1 })
        .toArray();

      const data = await Promise.all(
        requests.map(async (request) => {
          const club = await clubCollection.findOne(
            {
              _id: request.clubId,
            },
            {
              projection: {
                name: 1,
                slug: 1,
                logo: 1,
              },
            }
          );

          return {
            ...request,
            club,
          };
        })
      );

      res.status(200).json({
        success: true,
        message: "Your join requests fetched successfully.",
        count: data.length,
        data,
      });

    } catch (error) {
      console.error("Get my join requests error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch your join requests.",
      });
    }
  }
);


// ===================================
// 3. GET CLUB PENDING JOIN REQUESTS
// GET: /api/clubs/:clubId/join-requests
// ===================================

app.get(
  "/api/clubs/:clubId/join-requests",
  authenticateUser,
  requireClubPresident,
  async (req, res) => {
    try {
      const { clubId } = req.params;

      const requests = await joinRequestCollection
        .find({
          clubId: new ObjectId(clubId),
          status: "pending",
        })
        .sort({ createdAt: -1 })
        .toArray();

      const data = await Promise.all(
        requests.map(async (request) => {
          const user = await userCollection.findOne(
            {
              id: request.userId,
            },
            {
              projection: {
                id: 1,
                name: 1,
                email: 1,
                image: 1,
                role: 1,
              },
            }
          );

          return {
            ...request,
            user: user
              ? {
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  image: user.image,
                }
              : null,
          };
        })
      );

      res.status(200).json({
        success: true,
        message: "Club join requests fetched successfully.",
        count: data.length,
        data,
      });

    } catch (error) {
      console.error("Get club join requests error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch club join requests.",
      });
    }
  }
);


// ===================================
// 4. UPDATE JOIN REQUEST STATUS
// PATCH: /api/clubs/:clubId/join-requests/:requestId
// ===================================

app.patch(
  "/api/clubs/:clubId/join-requests/:requestId",
  authenticateUser,
  requireClubPresident,
  async (req, res) => {
    try {
      const { clubId, requestId } = req.params;
      const { status } = req.body;

      if (!ObjectId.isValid(requestId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid request ID.",
        });
      }

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be approved or rejected.",
        });
      }

      const requestFilter = {
        _id: new ObjectId(requestId),
        clubId: new ObjectId(clubId),
        status: "pending",
      };

      const request = await joinRequestCollection.findOne(
        requestFilter
      );

      if (!request) {
        return res.status(404).json({
          success: false,
          message: "Pending join request not found.",
        });
      }

      if (status === "approved") {
        const requestedUser = await userCollection.findOne(
          getUserFilter(request.userId),
        );

        if (!requestedUser) {
          return res.status(403).json({
            success: false,
            message: "The applicant account could not be found.",
          });
        }

        if (requestedUser.role === "banuser") {
          return res.status(403).json({
            success: false,
            message: "Restricted accounts cannot become club members.",
          });
        }

        // Create or reactivate membership
        await membershipCollection.updateOne(
          {
            userId: request.userId,
            clubId: new ObjectId(clubId),
          },
          {
            $set: {
              status: "active",
              joinedAt: new Date(),
              approvedBy: req.authUser.id,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              userId: request.userId,
              clubId: new ObjectId(clubId),
            },
          },
          {
            upsert: true,
          }
        );
      }

      // Only update a request that is still pending
      const result = await joinRequestCollection.updateOne(
        requestFilter,
        {
          $set: {
            status,
            reviewedBy: req.authUser.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      if (result.modifiedCount === 0) {
        return res.status(409).json({
          success: false,
          message: "This request has already been processed.",
        });
      }

      res.status(200).json({
        success: true,
        message: `Join request ${status} successfully.`,
        data: {
          requestId,
          clubId,
          userId: request.userId,
          status,
        },
      });

    } catch (error) {
      console.error("Update join request error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to update join request.",
      });
    }
  }
);


// ===================================
// 5. GET CLUB MEMBERS
// GET: /api/clubs/:clubId/members
// ===================================

app.get(
  "/api/clubs/:clubId/members",
  authenticateUser,
  requireClubPresident,
  async (req, res) => {
    try {
      const { clubId } = req.params;

      const memberships = await membershipCollection
        .find({
          clubId: new ObjectId(clubId),
          status: "active",
        })
        .sort({ joinedAt: -1 })
        .toArray();

      const data = await Promise.all(
        memberships.map(async (membership) => {
          const user = await userCollection.findOne(
            {
              id: membership.userId,
            },
            {
              projection: {
                id: 1,
                name: 1,
                email: 1,
                image: 1,
              },
            }
          );

          return {
            ...membership,
            user: user
              ? {
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  image: user.image,
                }
              : null,
          };
        })
      );

      res.status(200).json({
        success: true,
        message: "Club members fetched successfully.",
        count: data.length,
        data,
      });

    } catch (error) {
      console.error("Get club members error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch club members.",
      });
    }
  }
);


// ===================================
// 6. REMOVE CLUB MEMBER
// DELETE: /api/clubs/:clubId/members/:userId
// ===================================

app.delete(
  "/api/clubs/:clubId/members/:userId",
  authenticateUser,
  requireClubPresident,
  async (req, res) => {
    try {
      const { clubId, userId } = req.params;

      const result = await membershipCollection.updateOne(
        {
          clubId: new ObjectId(clubId),
          userId,
          status: "active",
        },
        {
          $set: {
            status: "inactive",
            removedBy: req.authUser.id,
            removedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      if (result.modifiedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Active membership not found.",
        });
      }

      res.status(200).json({
        success: true,
        message: "Member removed successfully.",
      });

    } catch (error) {
      console.error("Remove club member error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to remove club member.",
      });
    }
  }
);


// ===================================
// 7. CANCEL OWN PENDING REQUEST
// DELETE: /api/clubs/:clubId/join-requests/:requestId
// ===================================

app.delete(
  "/api/clubs/:clubId/join-requests/:requestId",
  authenticateUser,
  async (req, res) => {
    try {
      const { clubId, requestId } = req.params;

      if (
        !ObjectId.isValid(clubId) ||
        !ObjectId.isValid(requestId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid club ID or request ID.",
        });
      }

      const result = await joinRequestCollection.deleteOne({
        _id: new ObjectId(requestId),
        clubId: new ObjectId(clubId),
        userId: req.authUser.id,
        status: "pending",
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Pending join request not found.",
        });
      }

      res.status(200).json({
        success: true,
        message: "Join request cancelled successfully.",
      });

    } catch (error) {
      console.error("Cancel join request error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to cancel join request.",
      });
    }
  }
);

    await db.command({ ping: 1 });

    console.log("MongoDB Connected Successfully!");
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
}

run();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
