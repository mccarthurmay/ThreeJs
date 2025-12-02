#!/usr/bin/env python3
"""
Cloudinary Photo Classifier using CLIP
Automatically tags photos in your Cloudinary account with content, style, lighting, and color labels.

Usage:
    python classify_cloudinary.py              # Process both portfolio and rugby
    python classify_cloudinary.py portfolio    # Process only portfolio folder
    python classify_cloudinary.py rugby        # Process only rugby folder
"""

import torch
import clip
from PIL import Image
from PIL.ExifTags import TAGS
import requests
from io import BytesIO
import json
import cloudinary
import cloudinary.api
from tqdm import tqdm
import os
import sys
from datetime import datetime

# ============================================================================
# CONFIGURATION
# ============================================================================

# Load credentials from .cloudinary-config
def load_config():
    config_path = '.cloudinary-config'
    if not os.path.exists(config_path):
        print(f"Error: {config_path} not found!")
        print("Please create .cloudinary-config with your Cloudinary credentials:")
        print('''{
  "cloud_name": "your_cloud_name",
  "api_key": "your_api_key",
  "api_secret": "your_api_secret"
}''')
        sys.exit(1)

    with open(config_path, 'r') as f:
        return json.load(f)

config = load_config()

CLOUD_NAME = config['cloud_name']
API_KEY = config['api_key']
API_SECRET = config['api_secret']

# Tagging settings
TAGS_PER_IMAGE = 5
STYLE_TAGS_PER_IMAGE = 3
LIGHTING_TAGS_PER_IMAGE = 2
COLOR_TAGS_PER_IMAGE = 2

# ============================================================================
# LABEL SETS
# ============================================================================

CONTENT_LABELS = [
    # Nature & Landscapes
    "mountain", "beach", "ocean", "forest", "desert", "lake", "river", "waterfall",
    "sunset", "sunrise", "clouds", "sky", "snow", "ice", "volcano", "canyon",
    "valley", "cliff", "rock formation", "cave", "field", "meadow", "hills",
    "countryside", "coast", "island", "rainforest", "jungle", "savanna", "tundra",

    # Urban & Architecture
    "city", "cityscape", "skyline", "building", "skyscraper", "architecture",
    "street", "road", "bridge", "tunnel", "alley", "plaza", "square", "park",
    "monument", "statue", "tower", "church", "temple", "mosque", "castle",
    "house", "home", "apartment", "downtown", "suburb", "industrial area",
    "construction", "ruins", "ancient architecture", "modern architecture",

    # Animals & Wildlife
    "dog", "cat", "bird", "horse", "cow", "sheep", "elephant", "lion", "tiger",
    "bear", "wolf", "deer", "rabbit", "squirrel", "fish", "whale", "dolphin",
    "shark", "butterfly", "insect", "spider", "eagle", "owl", "penguin",
    "monkey", "gorilla", "giraffe", "zebra", "wildlife", "pet", "farm animal",

    # People & Portraits
    "portrait", "person", "people", "face", "child", "baby", "teenager",
    "adult", "elderly person", "family", "couple", "group of people", "crowd",
    "selfie", "profile", "close-up portrait", "candid", "model", "fashion model",

    # Objects & Still Life
    "food", "meal", "drink", "coffee", "wine", "fruit", "vegetables", "dessert",
    "flower", "bouquet", "plant", "tree", "garden", "book", "camera", "phone",
    "computer", "car", "bicycle", "motorcycle", "airplane", "boat", "ship",
    "furniture", "interior", "room", "kitchen", "bedroom", "living room",

    # Events & Activities
    "concert", "festival", "party", "celebration", "wedding", "sports", "game",
    "performance", "dance", "music", "art", "painting", "sculpture", "exhibition",
    "travel", "vacation", "adventure", "hiking", "camping", "skiing", "surfing",
    "swimming", "running", "yoga", "meditation", "work", "office", "meeting",

    # Weather & Seasons
    "rain", "storm", "lightning", "fog", "mist", "rainbow", "winter", "spring",
    "summer", "autumn", "fall colors", "cherry blossoms", "snow scene",

    # Abstract & Concepts
    "pattern", "texture", "abstract", "geometric", "symmetry", "reflection",
    "shadow", "silhouette", "motion blur", "bokeh", "depth of field",
    "minimalist", "negative space", "black and white", "monochrome", "colorful"
]

STYLE_LABELS = [
    # Photography Styles
    "cinematic", "documentary", "street photography", "landscape photography",
    "portrait photography", "wildlife photography", "macro photography",
    "aerial photography", "underwater photography", "night photography",
    "astrophotography", "long exposure", "time lapse", "HDR", "panorama",

    # Artistic Styles
    "vintage", "retro", "film photography", "polaroid", "analog", "grainy",
    "clean", "crisp", "sharp", "soft focus", "dreamy", "ethereal", "moody",
    "dramatic", "minimalist", "maximalist", "surreal", "abstract",

    # Post-Processing Styles
    "high contrast", "low contrast", "desaturated", "oversaturated",
    "warm tones", "cool tones", "sepia", "black and white", "color grading",
    "film grain", "vignette", "tilt-shift", "lens flare",

    # Art Movements (for artistic photos)
    "impressionist style", "expressionist style", "pop art style",
    "minimalist style", "bauhaus style", "art deco style", "modernist",

    # Digital Art Styles (if applicable)
    "digital painting", "photo manipulation", "composite", "CGI",
    "anime style", "cartoon style", "illustration style"
]

LIGHTING_LABELS = [
    # Natural Lighting
    "golden hour", "blue hour", "sunrise light", "sunset light", "midday sun",
    "overcast light", "soft light", "harsh light", "dappled light",
    "backlight", "backlit", "rim light", "silhouette lighting",

    # Artificial Lighting
    "studio lighting", "flash photography", "neon lighting", "street lights",
    "candlelight", "firelight", "stage lighting", "spotlight",

    # Lighting Quality
    "bright", "dark", "low light", "high key", "low key", "dramatic lighting",
    "flat lighting", "even lighting", "moody lighting", "atmospheric lighting",

    # Direction
    "front lit", "side lit", "top lit", "bottom lit",

    # Special
    "chiaroscuro", "Rembrandt lighting", "natural window light", "diffused light"
]

COLOR_LABELS = [
    # Color Palettes
    "warm colors", "cool colors", "pastel colors", "vibrant colors", "muted colors",
    "earth tones", "jewel tones", "neon colors", "monochromatic",

    # Dominant Colors
    "red dominant", "blue dominant", "green dominant", "yellow dominant",
    "orange dominant", "purple dominant", "pink dominant", "brown dominant",
    "gray dominant", "black dominant", "white dominant",

    # Color Characteristics
    "high saturation", "low saturation", "desaturated", "black and white",
    "grayscale", "sepia tone", "duotone", "triadic colors", "complementary colors",
    "analogous colors", "colorful", "multicolored"
]

# ============================================================================
# CLOUDINARY SETUP
# ============================================================================

cloudinary.config(
    cloud_name=CLOUD_NAME,
    api_key=API_KEY,
    api_secret=API_SECRET
)

def fetch_all_images():
    """Fetch all images from Cloudinary portfolio and rugby asset folders"""
    print("Fetching images from Cloudinary...")
    all_images = []

    # Fetch from both portfolio and rugby asset folders
    folders = ["portfolio", "rugby"]

    for folder in folders:
        print(f"\nFetching from '{folder}' asset folder...")
        next_cursor = None

        while True:
            try:
                # Use resources_by_asset_folder to access UI-based folders
                result = cloudinary.api.resources_by_asset_folder(
                    folder,
                    max_results=500,
                    next_cursor=next_cursor
                )

                folder_images = result.get("resources", [])

                # Add folder information to each image
                for img in folder_images:
                    img["folder"] = folder

                all_images.extend(folder_images)
                next_cursor = result.get("next_cursor")

                print(f"  Fetched {len(folder_images)} images from '{folder}'")
                print(f"  Total so far: {len(all_images)} images")

                if not next_cursor:
                    break
            except Exception as e:
                print(f"Error fetching images from {folder}: {e}")
                break

    print(f"\nTotal images found: {len(all_images)}")

    # Return public_id, secure_url, folder, and created_at (upload date)
    return [
        {
            "public_id": r["public_id"],
            "url": r["secure_url"],
            "folder": r.get("folder", "unknown"),
            "created_at": r.get("created_at", "")  # Cloudinary upload date
        }
        for r in all_images
    ]

# ============================================================================
# CLIP MODEL
# ============================================================================

print("Loading CLIP model...")

# Check for GPU availability (NVIDIA CUDA, AMD DirectML, or CPU)
if torch.cuda.is_available():
    device = "cuda"
    print(f"Using device: NVIDIA CUDA GPU")
    print(f"  GPU Name: {torch.cuda.get_device_name(0)}")
elif hasattr(torch.version, 'hip') and torch.version.hip is not None:
    # AMD ROCm support (Linux only)
    device = "cuda"  # ROCm uses 'cuda' as device string in PyTorch
    print(f"Using device: AMD ROCm GPU")
else:
    device = "cpu"
    print(f"Using device: CPU")

    # Check if DirectML could be available (Windows AMD/Intel GPUs)
    import platform
    if platform.system() == "Windows":
        try:
            import torch_directml
            device = torch_directml.device()
            print(f"  DirectML device available - using AMD/Intel GPU acceleration")
        except ImportError:
            print(f"  No GPU acceleration available")
            print(f"")
            print(f"  For AMD GPUs on Windows, install DirectML:")
            print(f"    pip install torch-directml")
            print(f"  This enables GPU acceleration for AMD and Intel GPUs on Windows")

model, preprocess = clip.load("ViT-B/32", device=device)
print("CLIP model loaded successfully!")

# ============================================================================
# CLIP TAGGING FUNCTIONS
# ============================================================================

def get_clip_tags(image, labels, top_k):
    """
    Get top-k labels for an image using CLIP similarity scoring

    Args:
        image: PIL Image
        labels: List of label strings
        top_k: Number of top labels to return

    Returns:
        List of top-k label strings
    """
    try:
        # Preprocess image
        image_input = preprocess(image).unsqueeze(0).to(device)

        # Tokenize labels
        text_inputs = clip.tokenize([f"a photo of {label}" for label in labels]).to(device)

        # Get features
        with torch.no_grad():
            image_features = model.encode_image(image_input)
            text_features = model.encode_text(text_inputs)

            # Normalize
            image_features /= image_features.norm(dim=-1, keepdim=True)
            text_features /= text_features.norm(dim=-1, keepdim=True)

            # Calculate similarity
            similarity = (image_features @ text_features.T).squeeze(0)

        # Get top-k
        values, indices = similarity.topk(top_k)

        return [labels[i] for i in indices.cpu().numpy()]
    except Exception as e:
        print(f"    Error in CLIP tagging: {e}")
        return []

def download_image(url):
    """Download image from URL and return PIL Image"""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        image = Image.open(BytesIO(response.content))

        # Convert to RGB if necessary
        if image.mode != 'RGB':
            image = image.convert('RGB')

        return image
    except Exception as e:
        print(f"    Error downloading image: {e}")
        return None

def calculate_saturation(image):
    """Calculate the average saturation of an image to determine if it's truly grayscale"""
    try:
        import numpy as np
        from colorsys import rgb_to_hsv

        # Resize for faster processing
        img = image.copy()
        img.thumbnail((150, 150))

        # Convert to numpy array
        pixels = np.array(img).reshape(-1, 3) / 255.0  # Normalize to 0-1

        # Calculate saturation for each pixel
        saturations = []
        for pixel in pixels:
            _, s, _ = rgb_to_hsv(pixel[0], pixel[1], pixel[2])
            saturations.append(s)

        # Return average saturation (0 = grayscale, 1 = fully saturated)
        return np.mean(saturations)
    except Exception as e:
        print(f"    Error calculating saturation: {e}")
        return 0.5  # Default to assuming color

def get_color_palette(image, num_colors=5):
    """Extract color palette from image using k-means clustering"""
    try:
        # Resize for faster processing
        img = image.copy()
        img.thumbnail((150, 150))

        # Convert to numpy array and reshape
        import numpy as np
        from sklearn.cluster import KMeans

        pixels = np.array(img).reshape(-1, 3)

        # Use k-means to find dominant colors
        kmeans = KMeans(n_clusters=num_colors, random_state=42, n_init=10)
        kmeans.fit(pixels)

        # Get cluster centers (the dominant colors)
        colors = kmeans.cluster_centers_

        # Count pixels in each cluster to get color weights
        labels = kmeans.labels_
        counts = np.bincount(labels)

        # Sort by frequency (most common first)
        indices = np.argsort(-counts)

        # Return colors sorted by frequency
        palette = [
            {
                'r': int(colors[i][0]),
                'g': int(colors[i][1]),
                'b': int(colors[i][2]),
                'weight': float(counts[i] / len(labels))
            }
            for i in indices
        ]

        return palette
    except Exception as e:
        print(f"    Error extracting color palette: {e}")
        # Return default gray palette
        return [{'r': 128, 'g': 128, 'b': 128, 'weight': 1.0}]

def filter_bw_tags(color_tags, saturation):
    """
    Filter out black and white/grayscale tags if the image actually has color.

    Args:
        color_tags: List of color tags from CLIP
        saturation: Average saturation of the image (0-1)

    Returns:
        Filtered list of color tags
    """
    # Threshold for considering an image truly grayscale
    # 0.15 means if average saturation is above 15%, it has meaningful color
    SATURATION_THRESHOLD = 0.15

    bw_keywords = ['black and white', 'grayscale', 'monochrome', 'sepia tone', 'duotone']

    if saturation > SATURATION_THRESHOLD:
        # Image has meaningful color, filter out B&W tags
        filtered_tags = [tag for tag in color_tags if tag.lower() not in bw_keywords]

        # If we filtered everything out, return the original (CLIP was very confident)
        if not filtered_tags:
            return color_tags

        return filtered_tags
    else:
        # Image is truly low saturation, keep B&W tags
        return color_tags

def get_photo_date(image):
    """Extract the date the photo was taken from EXIF metadata"""
    try:
        # Get EXIF data
        exif_data = image._getexif()

        if exif_data is None:
            return None

        # Look for date/time tags
        # DateTimeOriginal (36867) - when photo was taken
        # DateTime (306) - when file was modified
        # DateTimeDigitized (36868) - when photo was digitized

        for tag_id, value in exif_data.items():
            tag_name = TAGS.get(tag_id, tag_id)

            # Prefer DateTimeOriginal as it's the actual capture date
            if tag_name == 'DateTimeOriginal':
                # Format: "2024:12:25 14:30:45"
                try:
                    dt = datetime.strptime(value, "%Y:%m:%d %H:%M:%S")
                    return dt.isoformat()
                except:
                    return value  # Return raw if parsing fails

        # Fallback to DateTime if DateTimeOriginal not found
        for tag_id, value in exif_data.items():
            tag_name = TAGS.get(tag_id, tag_id)
            if tag_name == 'DateTime':
                try:
                    dt = datetime.strptime(value, "%Y:%m:%d %H:%M:%S")
                    return dt.isoformat()
                except:
                    return value

        return None

    except Exception as e:
        # print(f"    Error extracting EXIF date: {e}")
        return None

# ============================================================================
# MAIN PROCESSING
# ============================================================================

def process_all_images():
    """Main function to process all images"""

    # Fetch images from Cloudinary
    images = fetch_all_images()

    if not images:
        print("No images found!")
        return

    print(f"\nProcessing {len(images)} images with CLIP tagging...")
    print("=" * 60)

    results = {}

    # Process each image
    for idx, img_data in enumerate(tqdm(images, desc="Processing images")):
        public_id = img_data["public_id"]
        url = img_data["url"]
        folder = img_data.get("folder", "unknown")

        # Progress update every 10 images
        if (idx + 1) % 10 == 0:
            print(f"\nProcessed {idx + 1}/{len(images)} images...")

        try:
            # Download image
            image = download_image(url)
            if image is None:
                print(f"  Skipping {public_id} (download failed)")
                continue

            # Extract photo date from EXIF metadata (actual date photo was taken)
            photo_date = get_photo_date(image)
            if photo_date is None:
                # Fallback to Cloudinary upload date if no EXIF data
                photo_date = img_data.get("created_at", "")

            # Calculate saturation to detect truly grayscale images
            saturation = calculate_saturation(image)

            # Generate tags
            content_tags = get_clip_tags(image, CONTENT_LABELS, TAGS_PER_IMAGE)
            style_tags = get_clip_tags(image, STYLE_LABELS, STYLE_TAGS_PER_IMAGE)
            lighting_tags = get_clip_tags(image, LIGHTING_LABELS, LIGHTING_TAGS_PER_IMAGE)
            color_tags_raw = get_clip_tags(image, COLOR_LABELS, COLOR_TAGS_PER_IMAGE)

            # Filter out incorrect B&W tags for colored images
            color_tags = filter_bw_tags(color_tags_raw, saturation)

            # Extract color palette (5 dominant colors)
            color_palette = get_color_palette(image, num_colors=5)

            # Combine all tags
            all_tags = content_tags + style_tags + lighting_tags + color_tags

            # Store results
            results[public_id] = {
                "url": url,
                "folder": folder,  # Store which folder this image belongs to
                "created_at": photo_date,  # Use actual photo date from EXIF
                "content": content_tags,
                "style": style_tags,
                "lighting": lighting_tags,
                "colors": color_tags,
                "color_palette": color_palette,
                "all_tags": all_tags
            }

        except Exception as e:
            print(f"  Error processing {public_id}: {e}")
            continue

    print("\n" + "=" * 60)
    print(f"Successfully processed {len(results)}/{len(images)} images")

    # Save results
    output_file = "tags.json"
    print(f"\nSaving results to {output_file}...")

    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"Results saved to {output_file}")
    print(f"Total tagged photos: {len(results)}")

    # Print sample
    if results:
        print("\nSample result:")
        sample_id = list(results.keys())[0]
        sample = results[sample_id]
        print(f"  Photo: {sample_id}")
        print(f"  Content: {', '.join(sample['content'])}")
        print(f"  Style: {', '.join(sample['style'])}")
        print(f"  Lighting: {', '.join(sample['lighting'])}")
        print(f"  Colors: {', '.join(sample['colors'])}")

def process_images_only(images):
    """Process images and return results without saving"""
    print(f"\nProcessing {len(images)} images with CLIP tagging...")
    print("=" * 60)

    results = {}

    for idx, img_data in enumerate(tqdm(images, desc="Processing images")):
        public_id = img_data["public_id"]
        url = img_data["url"]
        folder = img_data.get("folder", "unknown")

        if (idx + 1) % 10 == 0:
            print(f"\nProcessed {idx + 1}/{len(images)} images...")

        try:
            image = download_image(url)
            if image is None:
                print(f"  Skipping {public_id} (download failed)")
                continue

            photo_date = get_photo_date(image)
            if photo_date is None:
                photo_date = img_data.get("created_at", "")

            # Calculate saturation to detect truly grayscale images
            saturation = calculate_saturation(image)

            content_tags = get_clip_tags(image, CONTENT_LABELS, TAGS_PER_IMAGE)
            style_tags = get_clip_tags(image, STYLE_LABELS, STYLE_TAGS_PER_IMAGE)
            lighting_tags = get_clip_tags(image, LIGHTING_LABELS, LIGHTING_TAGS_PER_IMAGE)
            color_tags_raw = get_clip_tags(image, COLOR_LABELS, COLOR_TAGS_PER_IMAGE)

            # Filter out incorrect B&W tags for colored images
            color_tags = filter_bw_tags(color_tags_raw, saturation)

            color_palette = get_color_palette(image, num_colors=5)

            all_tags = content_tags + style_tags + lighting_tags + color_tags

            results[public_id] = {
                "url": url,
                "folder": folder,
                "created_at": photo_date,
                "content": content_tags,
                "style": style_tags,
                "lighting": lighting_tags,
                "colors": color_tags,
                "color_palette": color_palette,
                "all_tags": all_tags
            }

        except Exception as e:
            print(f"  Error processing {public_id}: {e}")
            continue

    print("\n" + "=" * 60)
    print(f"Successfully processed {len(results)}/{len(images)} images")

    return results

# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("CLOUDINARY PHOTO CLASSIFIER WITH CLIP")
    print("=" * 60)
    print()

    # Check for command-line argument
    if len(sys.argv) > 1:
        folder_arg = sys.argv[1].lower()
        if folder_arg in ['portfolio', 'rugby']:
            print(f"Processing only '{folder_arg}' folder")
            # Modify fetch_all_images to only fetch specified folder
            import classify_cloudinary
            original_fetch = fetch_all_images

            def fetch_single_folder():
                return fetch_images_from_folder(folder_arg)

            def fetch_images_from_folder(folder_name):
                print(f"\nFetching from '{folder_name}' asset folder...")
                all_images = []
                next_cursor = None

                while True:
                    try:
                        result = cloudinary.api.resources_by_asset_folder(
                            folder_name,
                            max_results=500,
                            next_cursor=next_cursor
                        )

                        folder_images = result.get("resources", [])
                        for img in folder_images:
                            img["folder"] = folder_name

                        all_images.extend(folder_images)
                        next_cursor = result.get("next_cursor")

                        print(f"  Fetched {len(folder_images)} images from '{folder_name}'")
                        print(f"  Total so far: {len(all_images)} images")

                        if not next_cursor:
                            break
                    except Exception as e:
                        print(f"Error fetching images from {folder_name}: {e}")
                        break

                print(f"\nTotal images found: {len(all_images)}")
                return [
                    {
                        "public_id": r["public_id"],
                        "url": r["secure_url"],
                        "folder": r.get("folder", "unknown"),
                        "created_at": r.get("created_at", "")  # Cloudinary upload date
                    }
                    for r in all_images
                ]

            # Load existing tags and merge
            existing_tags = {}
            if os.path.exists('tags.json'):
                with open('tags.json', 'r') as f:
                    existing_tags = json.load(f)
                print(f"Loaded {len(existing_tags)} existing tags from tags.json")

            # Fetch and process only specified folder
            images = fetch_images_from_folder(folder_arg)
            if images:
                results = process_images_only(images)
                # Merge with existing
                final_results = {**existing_tags, **results}
                # Save
                with open('tags.json', 'w') as f:
                    json.dump(final_results, f, indent=2)
                print(f"\nResults saved to tags.json")
                print(f"Total photos in database: {len(final_results)}")
        else:
            print(f"Unknown folder: {folder_arg}")
            print("Usage: python classify_cloudinary.py [portfolio|rugby]")
            sys.exit(1)
    else:
        # Default: process both folders
        process_all_images()

    print("\n" + "=" * 60)
    print("DONE! You can now use tags.json in your Photography World.")
    print("=" * 60)
