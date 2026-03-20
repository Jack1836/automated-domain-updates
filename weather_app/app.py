from flask import Flask, render_template, request
import requests

app = Flask(__name__)

def get_coordinates(city):
    geo_url = "https://geocoding-api.open-meteo.com/v1/search"
    params = {"name": city, "count": 1}

    response = requests.get(geo_url, params=params)
    data = response.json()

    if "results" not in data:
        return None

    latitude = data["results"][0]["latitude"]
    longitude = data["results"][0]["longitude"]

    return latitude, longitude


def get_weather(city):
    coords = get_coordinates(city)
    if not coords:
        return None

    latitude, longitude = coords

    weather_url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current_weather": True
    }

    response = requests.get(weather_url, params=params)
    data = response.json()

    return {
        "temperature": data["current_weather"]["temperature"],
        "windspeed": data["current_weather"]["windspeed"]
    }


@app.route("/", methods=["GET", "POST"])
def index():
    weather_data = None
    city = None

    if request.method == "POST":
        city = request.form["city"]
        weather_data = get_weather(city)

    return render_template("index.html", weather=weather_data, city=city)


if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5002)
