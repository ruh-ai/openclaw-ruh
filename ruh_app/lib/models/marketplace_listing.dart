class MarketplaceListing {
  final String id;
  final String agentId;
  final String publisherId;
  final String? ownerOrgId;
  final String title;
  final String slug;
  final String summary;
  final String description;
  final String category;
  final List<String> tags;
  final String? iconUrl;
  final List<String> screenshots;
  final String version;
  final String status;
  final String? reviewNotes;
  final String? reviewedBy;
  final String? reviewedAt;
  final int installCount;
  final double avgRating;
  final String? publishedAt;
  final String createdAt;
  final String updatedAt;

  const MarketplaceListing({
    required this.id,
    required this.agentId,
    required this.publisherId,
    required this.ownerOrgId,
    required this.title,
    required this.slug,
    required this.summary,
    required this.description,
    required this.category,
    required this.tags,
    required this.iconUrl,
    required this.screenshots,
    required this.version,
    required this.status,
    required this.reviewNotes,
    required this.reviewedBy,
    required this.reviewedAt,
    required this.installCount,
    required this.avgRating,
    required this.publishedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory MarketplaceListing.fromJson(Map<String, dynamic> json) {
    String readString(
      String camelKey, [
      String? snakeKey,
      String fallback = '',
    ]) {
      final value =
          json[camelKey] ?? (snakeKey == null ? null : json[snakeKey]);
      if (value == null) {
        return fallback;
      }
      return value.toString();
    }

    String? readNullableString(String camelKey, [String? snakeKey]) {
      final value =
          json[camelKey] ?? (snakeKey == null ? null : json[snakeKey]);
      if (value == null) {
        return null;
      }
      final text = value.toString();
      return text.isEmpty ? null : text;
    }

    List<String> readStringList(dynamic value) {
      if (value is List) {
        return value.map((item) => item.toString()).toList();
      }
      return const [];
    }

    double readDouble(String camelKey, [String? snakeKey]) {
      final value =
          json[camelKey] ?? (snakeKey == null ? null : json[snakeKey]);
      if (value is num) {
        return value.toDouble();
      }
      return double.tryParse(value?.toString() ?? '') ?? 0;
    }

    int readInt(String camelKey, [String? snakeKey]) {
      final value =
          json[camelKey] ?? (snakeKey == null ? null : json[snakeKey]);
      if (value is num) {
        return value.toInt();
      }
      return int.tryParse(value?.toString() ?? '') ?? 0;
    }

    return MarketplaceListing(
      id: readString('id'),
      agentId: readString('agentId', 'agent_id'),
      publisherId: readString('publisherId', 'publisher_id'),
      ownerOrgId: readNullableString('ownerOrgId', 'owner_org_id'),
      title: readString('title'),
      slug: readString('slug'),
      summary: readString('summary'),
      description: readString('description'),
      category: readString('category'),
      tags: readStringList(json['tags']),
      iconUrl: readNullableString('iconUrl', 'icon_url'),
      screenshots: readStringList(json['screenshots']),
      version: readString('version', null, '1.0.0'),
      status: readString('status', null, 'published'),
      reviewNotes: readNullableString('reviewNotes', 'review_notes'),
      reviewedBy: readNullableString('reviewedBy', 'reviewed_by'),
      reviewedAt: readNullableString('reviewedAt', 'reviewed_at'),
      installCount: readInt('installCount', 'install_count'),
      avgRating: readDouble('avgRating', 'avg_rating'),
      publishedAt: readNullableString('publishedAt', 'published_at'),
      createdAt: readString('createdAt', 'created_at'),
      updatedAt: readString('updatedAt', 'updated_at'),
    );
  }

  String get categoryLabel {
    if (category.isEmpty) {
      return 'General';
    }
    return category[0].toUpperCase() + category.substring(1);
  }
}

class MarketplaceListingsResponse {
  final List<MarketplaceListing> items;
  final int total;

  const MarketplaceListingsResponse({required this.items, required this.total});

  factory MarketplaceListingsResponse.fromJson(Map<String, dynamic> json) {
    final items = (json['items'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(MarketplaceListing.fromJson)
        .toList();
    final totalValue = json['total'];

    return MarketplaceListingsResponse(
      items: items,
      total: totalValue is num
          ? totalValue.toInt()
          : int.tryParse(totalValue?.toString() ?? '') ?? items.length,
    );
  }
}

class InstalledMarketplaceListing {
  final String installId;
  final String listingId;
  final String? orgId;
  final String userId;
  final String agentId;
  final String? sourceAgentVersionId;
  final String installedVersion;
  final String installedAt;
  final String? lastLaunchedAt;
  final MarketplaceListing listing;

  const InstalledMarketplaceListing({
    required this.installId,
    required this.listingId,
    this.orgId,
    required this.userId,
    required this.agentId,
    this.sourceAgentVersionId,
    required this.installedVersion,
    required this.installedAt,
    this.lastLaunchedAt,
    required this.listing,
  });

  factory InstalledMarketplaceListing.fromJson(Map<String, dynamic> json) {
    final listingJson = json['listing'];
    final listingMap = listingJson is Map<String, dynamic>
        ? listingJson
        : <String, dynamic>{};

    String readString(
      String camelKey, [
      String? snakeKey,
      String fallback = '',
    ]) {
      final value =
          json[camelKey] ?? (snakeKey == null ? null : json[snakeKey]);
      if (value == null) {
        return fallback;
      }
      return value.toString();
    }

    return InstalledMarketplaceListing(
      installId: readString('installId', 'install_id'),
      listingId: readString('listingId', 'listing_id'),
      orgId: readString('orgId', 'org_id').isEmpty
          ? null
          : readString('orgId', 'org_id'),
      userId: readString('userId', 'user_id'),
      agentId: readString('agentId', 'agent_id'),
      sourceAgentVersionId:
          readString('sourceAgentVersionId', 'source_agent_version_id').isEmpty
          ? null
          : readString('sourceAgentVersionId', 'source_agent_version_id'),
      installedVersion: readString(
        'installedVersion',
        'installed_version',
        listingMap['version']?.toString() ?? '1.0.0',
      ),
      installedAt: readString('installedAt', 'installed_at'),
      lastLaunchedAt:
          readString('lastLaunchedAt', 'last_launched_at').isEmpty
          ? null
          : readString('lastLaunchedAt', 'last_launched_at'),
      listing: MarketplaceListing.fromJson(listingMap),
    );
  }
}
