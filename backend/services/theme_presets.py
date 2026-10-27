"""Trending CV styles built as presets on top of RenderCV's themes.

Each preset is a base theme plus a design recipe (fonts, header and section
title style, spacing). All are single-column with standard headings, so they
stay ATS-friendly. Users' own design settings are applied on top, so a chosen
colour or font still wins.

``defaults`` are the font and accent colour the editor applies when the user
picks the preset; they are also used when a request carries no design settings.
"""

from copy import deepcopy
from typing import Any

THEME_PRESETS: dict[str, dict[str, Any]] = {
    "modern": {
        "base": "classic",
        "defaults": {"fontFamily": "Open Sauce Sans", "primaryColor": "#2563EB"},
        "design": {
            "header": {"alignment": "left"},
            "section_titles": {"type": "with_full_line", "line_thickness": "0.4pt", "space_above": "0.55cm"},
            "typography": {"line_spacing": "0.7em"},
        },
        "meta": {
            "name": "Modern Minimal",
            "description": "Clean sans-serif layout with airy spacing and hairline section rules.",
            "bestFor": "Tech, product, design and most modern roles",
            "atsScore": 95,
            "atsRationale": "Single column, standard headings, plain text links and no decorative elements.",
            "recommendedFor": ["software", "product", "design", "marketing", "startup"],
            "sectionOrderType": "standard",
        },
    },
    "executive": {
        "base": "classic",
        "defaults": {"fontFamily": "EB Garamond", "primaryColor": "#1A365D"},
        "design": {
            "header": {"alignment": "center"},
            "section_titles": {"type": "centered_with_full_line", "line_thickness": "0.6pt"},
            "typography": {"small_caps": {"section_titles": True}},
        },
        "meta": {
            "name": "Executive Serif",
            "description": "Refined serif typography with a centred header for senior roles.",
            "bestFor": "Leadership, finance, legal, consulting",
            "atsScore": 92,
            "atsRationale": "Conventional single-column flow; serif type parses as plain text.",
            "recommendedFor": ["senior", "director", "executive", "finance", "legal", "consulting"],
            "sectionOrderType": "recruiter",
        },
    },
    "bold": {
        "base": "classic",
        "defaults": {"fontFamily": "Poppins", "primaryColor": "#0D9488"},
        "design": {
            "header": {"alignment": "left"},
            "section_titles": {"type": "with_partial_line", "line_thickness": "1.5pt"},
            "typography": {"bold": {"name": True, "section_titles": True}},
        },
        "meta": {
            "name": "Bold Accent",
            "description": "Confident geometric type with a strong accent colour and accent rules.",
            "bestFor": "Marketing, sales, creative and customer-facing roles",
            "atsScore": 93,
            "atsRationale": "Colour is decorative only; structure stays single-column with standard headings.",
            "recommendedFor": ["marketing", "sales", "creative", "brand", "growth"],
            "sectionOrderType": "standard",
        },
    },
    "startup": {
        "base": "classic",
        "defaults": {"fontFamily": "Raleway", "primaryColor": "#0F766E"},
        "design": {
            "header": {"alignment": "left"},
            "section_titles": {"type": "without_line", "space_above": "0.6cm", "space_below": "0.25cm"},
        },
        "meta": {
            "name": "Clean Startup",
            "description": "Lightweight, rule-free layout that lets project work stand out.",
            "bestFor": "Startups, engineers with strong projects, early-career builders",
            "atsScore": 94,
            "atsRationale": "No tables or lines to confuse parsers; clear headings and spacing.",
            "recommendedFor": ["startup", "projects", "engineering", "new grad"],
            "sectionOrderType": "portfolio",
        },
    },
    "elegant": {
        "base": "classic",
        "defaults": {"fontFamily": "Libertinus Serif", "primaryColor": "#334155"},
        "design": {
            "header": {"alignment": "center"},
            "section_titles": {"type": "centered_without_line"},
            "typography": {"small_caps": {"name": True, "section_titles": True}},
        },
        "meta": {
            "name": "Elegant Classic",
            "description": "Timeless book-style serif with small-caps headings.",
            "bestFor": "Academia, research, publishing and policy",
            "atsScore": 90,
            "atsRationale": "Readable single column; small caps render as regular text for parsers.",
            "recommendedFor": ["academic", "research", "publishing", "policy", "writing"],
            "sectionOrderType": "academic",
        },
    },
    "compact": {
        "base": "classic",
        "defaults": {"fontFamily": "Lato", "primaryColor": "#111827"},
        "design": {
            "page": {"top_margin": "1.2cm", "bottom_margin": "1.2cm", "left_margin": "1.4cm", "right_margin": "1.4cm"},
            "typography": {"font_size": {"body": "9.5pt"}, "line_spacing": "0.5em"},
            "section_titles": {"type": "with_full_line", "space_above": "0.35cm", "space_below": "0.2cm"},
            "header": {"space_below_name": "0.2cm", "space_below_headline": "0.2cm"},
        },
        "meta": {
            "name": "Compact One-Page",
            "description": "Tight spacing and smaller type to fit a full career on one page.",
            "bestFor": "Experienced candidates who need everything on one page",
            "atsScore": 95,
            "atsRationale": "Dense but strictly single-column with standard section names.",
            "recommendedFor": ["experienced", "one page", "engineering", "operations"],
            "sectionOrderType": "recruiter",
        },
    },
}


def merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """Deep-merge ``override`` into a copy of ``base`` (override wins)."""
    result = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


# Current CV style drops the "Last updated" note and the page-number footer.
for _preset in THEME_PRESETS.values():
    _preset["design"] = merge({"page": {"show_footer": False, "show_top_note": False}}, _preset["design"])
